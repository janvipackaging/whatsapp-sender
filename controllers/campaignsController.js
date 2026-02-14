const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Blocklist = require('../models/Blocklist'); 
const { Client } = require("@upstash/qstash");
const fetch = require('node-fetch'); 
require('dotenv').config();

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN,
});

// --- HELPER: Clean Phone Number for Meta API ---
// Meta strictly forbids '+' or spaces in the API 'to' field.
function cleanPhoneForMeta(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, ''); // Remove all non-digits
  
  // If number starts with 00, replace with nothing (common international prefix)
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  
  // Basic India handling: if it's 10 digits, prefix 91
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  
  return cleaned;
}

// @desc    Show the "Create New Campaign" page
exports.getCampaignPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();
    const templates = await Template.find(); 

    res.render('campaigns', {
      user: req.user,
      companies: companies,
      segments: segments,
      templates: templates
    });

  } catch (error) {
    console.error('Error fetching data for campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

// @desc    Start sending a new bulk message campaign
exports.startCampaign = async (req, res) => {
  const { companyId, segmentId, templateId, name } = req.body; 

  if (!companyId || !segmentId || !templateId) { 
    req.flash('error_msg', 'Company, Segment, and Template are required.');
    return res.redirect('/campaigns');
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      req.flash('error_msg', 'Company not found.');
      return res.redirect('/campaigns');
    }

    const template = await Template.findById(templateId);
    if (!template) {
      req.flash('error_msg', 'Template not found.');
      return res.redirect('/campaigns');
    }
    
    const templateName = (template.codeName || template.templateName || template.name || '').trim();

    const segmentContacts = await Contact.find({ company: companyId, segments: segmentId });

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment.');
       return res.redirect('/campaigns');
    }
    
    // --- BLOCKLIST CHECK ---
    const blockedNumbersDocs = await Blocklist.find({ company: companyId });
    const blockedPhones = new Set(blockedNumbersDocs.map(doc => doc.phone));
    let contactsToSend = [];
    
    segmentContacts.forEach(contact => {
        if (!blockedPhones.has(contact.phone)) {
            contactsToSend.push(contact);
        }
    });

    if (contactsToSend.length === 0) {
      req.flash('error_msg', 'Campaign Blocked: All contacts are in the blocklist.');
      return res.redirect('/campaigns');
    }

    const newCampaign = new Campaign({
      name: name || template.name, 
      company: companyId,
      segment: segmentId,
      templateName: templateName, 
      totalSent: contactsToSend.length, 
      status: 'Sending'
    });
    await newCampaign.save();

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;

    let jobsAdded = 0;
    
    let hasVariable = template.variable1 || (template.variables && template.variables.length > 0);
    if (templateName.toLowerCase().includes('calculator')) hasVariable = true;

    for (const contact of contactsToSend) { 
      // CRITICAL: Clean the phone number before sending to the QStash job
      const cleanedTo = cleanPhoneForMeta(contact.phone);
      
      const jobData = {
        // Overwrite the contact phone with a cleaned one for the API call
        contact: { ...contact.toObject(), phone: cleanedTo },
        templateName: templateName, 
        companyToken: token,
        companyNumberId: phoneId,
        campaignId: newCampaign._id,
        variableValue: hasVariable ? (contact.name || 'Customer') : null,
        // Pass the variable name as well so the worker knows what key to use
        variableName: template.variable1 || "customer_name" 
      };

      await qstashClient.publishJSON({
        url: destinationUrl,
        body: jobData,
        retries: 3
      });
      jobsAdded++;
    }

    req.flash('success_msg', `Campaign Started! ${jobsAdded} messages queued via QStash.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('Error starting campaign:', error);
    req.flash('error_msg', 'Server Error starting campaign.');
    res.redirect('/campaigns');
  }
};


// --- ULTIMATE TEST SENDER (Matches PowerShell Configuration exactly) ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    let targetPhone = phone || req.body.testPhone;

    if (!companyId || !templateId || !targetPhone) {
      req.flash('error_msg', 'Fields missing.');
      return res.redirect('/campaigns');
    }

    // --- FIX 1: Strict Cleaning of Phone Number ---
    targetPhone = cleanPhoneForMeta(targetPhone);

    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company || !template) {
        req.flash('error_msg', 'Company or Template not found.');
        return res.redirect('/campaigns');
    }

    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    
    // --- FIX 2: Force v17.0 (PowerShell Match) ---
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    
    const tplName = (template.codeName || template.templateName || template.name || '').trim();
    const dbVarName = template.variable1 || 'customer_name'; 
    
    // --- HELPER: Send Request with different parameter strategies ---
    async function attemptSend(mode, lang = "en_US") {
        let components = [];

        if (mode === 'named_db') {
            // Strategy 1: Named Parameter using DB name
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: dbVarName 
                }]
            }];
        } else if (mode === 'named_ui') {
            // Strategy 2: Named Parameter using 'name' (Matches {{name}} in UI)
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: "name" 
                }]
            }];
        } else if (mode === 'standard') {
            // Strategy 3: Standard Positional
            components = [{
                type: "body",
                parameters: [{ type: "text", text: "Valued Customer" }]
            }];
        } 
        // Mode 'none' sends empty components

        const payload = {
            messaging_product: "whatsapp",
            to: targetPhone,
            type: "template",
            template: {
                name: tplName,
                language: { code: lang }, 
                components: components
            }
        };

        console.log(`Trying Mode: ${mode}, Lang: ${lang}, To: ${targetPhone}`);
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    // --- EXECUTE STRATEGY WATERFALL ---
    
    // 1. Try Named (DB Name) - PowerShell script match
    let result = await attemptSend('named_db', 'en_US');
    if (!result.error) return success(req, res, targetPhone);

    const firstError = result.error;
    console.log(`Failed (Named DB): ${firstError.message}`);

    // 2. Try Named (UI 'name') - If Meta UI shows {{name}}
    if (firstError.code === 100 || firstError.code === 132000) {
        result = await attemptSend('named_ui', 'en_US');
        if (!result.error) return success(req, res, targetPhone);
        console.log(`Failed (Named UI): ${result.error.message}`);
    }

    // 3. Try Standard Positional (Fallback)
    if (firstError.code !== 132001) {
        result = await attemptSend('standard', 'en_US');
        if (!result.error) return success(req, res, targetPhone);
        console.log(`Failed (Standard): ${result.error.message}`);
    }

    // 4. Try No Params (Last Resort)
    if (result.error && (result.error.code === 100 || result.error.code === 132000)) {
        console.log("Param mismatch. Trying No Params...");
        result = await attemptSend('none', 'en_US');
        if (!result.error) return success(req, res, targetPhone);
    }

    // 5. Try 'en' (Language code fallback)
    if (result.error && result.error.code === 132001) {
         console.log("Language error. Trying code 'en'...");
         result = await attemptSend('named_db', 'en');
         if (!result.error) return success(req, res, targetPhone);
    }

    // Capture the most descriptive error for the user
    const errorToDisplay = firstError.code === 100 ? firstError : result.error;
    console.error('All attempts failed for test message.');
    req.flash('error_msg', `Meta Error (${errorToDisplay.code}): ${errorToDisplay.message}`);
    return res.redirect('/campaigns');

  } catch (error) {
    console.error('Server Error sending test:', error);
    req.flash('error_msg', 'Server Error: ' + error.message);
    res.redirect('/campaigns');
  }
};

// Helper for success response
function success(req, res, phone) {
    console.log(`Message sent successfully to ${phone}`);
    req.flash('success_msg', `Test message sent to ${phone} successfully!`);
    res.redirect('/campaigns');
}