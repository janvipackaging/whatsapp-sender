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

    // Note: Global middleware in index.js handles flash messages now.
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
    if (!company) { req.flash('error_msg', 'Company not found.'); return res.redirect('/campaigns'); }

    const template = await Template.findById(templateId);
    if (!template) { req.flash('error_msg', 'Template not found.'); return res.redirect('/campaigns'); }
    
    // Safety check for template name
    const templateName = (template.codeName || template.templateName || template.name || '').trim();

    const segmentContacts = await Contact.find({ company: companyId, segments: segmentId });

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment for this company.');
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
    
    for (const contact of contactsToSend) { 
      const jobData = {
        contact: contact,
        templateName: templateName, 
        companyToken: token,
        companyNumberId: phoneId,
        campaignId: newCampaign._id,
        variableValue: contact.name || 'Customer' 
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


// --- SMART TEST MESSAGE (EXACT POWERSHELL MATCH) ---
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
    
    // Use v19.0 as standard, but v17.0 is also fine.
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    
    // Ensure clean name
    const tplName = (template.codeName || template.templateName || '').trim();

    // --- HELPER: Send Request ---
    async function attemptSend(mode) {
        let components = [];

        if (mode === 'named') {
            // MATCHING YOUR POWERSHELL SCRIPT
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: "customer_name" 
                }]
            }];
        } else if (mode === 'standard') {
            // Standard Positional (Backup)
            components = [{
                type: "body",
                parameters: [{ type: "text", text: "Valued Customer" }]
            }];
        } 
        // Mode 'none' sends empty components []

        const payload = {
            messaging_product: "whatsapp",
            to: targetPhone,
            type: "template",
            template: {
                name: tplName,
                language: { code: "en_US" }, // Explicitly US English
                components: components
            }
        };

        console.log(`Attempting Mode: ${mode}`);
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    // --- EXECUTE STRATEGY ---
    
    // 1. Try Named Parameters (Primary)
    let result = await attemptSend('named');
    if (!result.error) return success(res, targetPhone);

    // Capture the first error - this is usually the real one
    const firstError = result.error;
    console.log("Named param failed:", JSON.stringify(firstError));

    // 2. Try Standard Parameters (Fallback)
    // Only try this if the error wasn't "Template does not exist"
    if (firstError.code !== 132001) {
        result = await attemptSend('standard');
        if (!result.error) return success(res, targetPhone);
    }

    // 3. Try No Parameters (Last Resort)
    // Only try this if previous errors were parameter related (#100 or #132000)
    if (result.error && (result.error.code === 100 || result.error.message.includes('parameter'))) {
        console.log("Param error detected. Trying No Params...");
        result = await attemptSend('none');
        if (!result.error) return success(res, targetPhone);
    }

    // If we get here, everything failed.
    // SHOW THE FIRST ERROR (Named Param) because that's the one that matches your script.
    console.error('All Attempts Failed.');
    req.flash('error_msg', `Meta Error (${firstError.code}): ${firstError.message}`);
    return res.redirect('/campaigns');

  } catch (error) {
    console.error('Server Error sending test:', error);
    req.flash('error_msg', 'Server Error: ' + error.message);
    res.redirect('/campaigns');
  }
};

// Helper for success response
function success(res, phone) {
    console.log(`Message sent successfully to ${phone}`);
    req.flash('success_msg', `Test message sent to ${phone} successfully!`);
    res.redirect('/campaigns');
}