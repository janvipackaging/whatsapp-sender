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

// @desc    Show the "Create New Campaign" page
exports.getCampaignPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();
    const templates = await Template.find(); 

    // Global middleware in index.js handles flash messages.
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
    
    const templateName = template.codeName || template.templateName || template.name; 

    const segmentContacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

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
    
    // SMART CHECK: Does this template need a variable?
    // 1. Check DB 'variable1'
    // 2. Check if name contains 'calculator' (Hard fix for your specific issue)
    let hasVariable = template.variable1 || (template.variables && template.variables.length > 0);
    if (templateName.toLowerCase().includes('calculator')) {
        hasVariable = true;
    }

    for (const contact of contactsToSend) { 
      const jobData = {
        contact: contact,
        templateName: templateName, 
        companyToken: token,
        companyNumberId: phoneId,
        campaignId: newCampaign._id,
        variableValue: hasVariable ? (contact.name || 'Customer') : null
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


// --- ULTIMATE TEST SENDER (v17.0 + Smart Error Reporting) ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    const targetPhone = phone || req.body.testPhone;

    if (!companyId || !templateId || !targetPhone) {
      req.flash('error_msg', 'Fields missing.');
      return res.redirect('/campaigns');
    }

    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company || !template) {
        req.flash('error_msg', 'Company or Template not found.');
        return res.redirect('/campaigns');
    }

    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    
    // FORCE v17.0 (Matching your working PowerShell script)
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    
    const tplName = (template.codeName || template.templateName || '').trim();
    const dbVarName = template.variable1 || 'customer_name'; // Use DB var name or default
    
    // --- HELPER: Send Request ---
    async function attemptSend(mode, lang = "en_US") {
        let components = [];

        if (mode === 'named') {
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: dbVarName 
                }]
            }];
        } else if (mode === 'standard') {
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

        console.log(`Trying: Mode=${mode}, Lang=${lang}`);
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    // --- STRATEGY: TRY EVERYTHING ---
    
    // 1. Named Param (Exact PowerShell Match) + en_US
    let result = await attemptSend('named', 'en_US');
    if (!result.error) return success(req, res, targetPhone);

    const firstError = result.error;
    console.log(`Failed (Named/US): ${firstError.message}`);

    // 2. Standard Param + en_US (Common UI Template)
    // Only try if the template actually exists (ignore language errors for now)
    if (firstError.code !== 132001) {
        result = await attemptSend('standard', 'en_US');
        if (!result.error) return success(req, res, targetPhone);
    }

    // 3. No Params (Only if previous errors suggest param issues like #100 or #132000)
    if (result.error && (result.error.code === 100 || result.error.code === 132000 || result.error.message.includes('parameter'))) {
        console.log("Param error detected. Trying No Params...");
        result = await attemptSend('none', 'en_US');
        if (!result.error) return success(req, res, targetPhone);
    }

    // FAILURE: Show the error that matters
    // If Attempt 3 failed with "Mismatch (#132000)", it means we sent 0 but it wanted 1.
    // In that case, the REAL error is why Attempt 1/2 failed.
    // So we show 'firstError' (from Attempt 1) because that used variables.
    
    let errorToDisplay = result.error;
    if (result.error.code === 132000) {
        errorToDisplay = firstError; // Show the named param error instead
    }

    console.error('All Attempts Failed.');
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