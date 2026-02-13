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
    
    const templateName = template.codeName || template.templateName || template.name; 

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


// --- ULTIMATE WATERFALL TEST SENDER ---
// Tries 3 different payload formats until one works.
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
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const tplName = template.codeName || template.templateName;

    // --- HELPER: Send Request with Specific Payload Mode ---
    async function attemptSend(mode) {
        let components = [];

        if (mode === 'standard') {
            // Try 1: Standard Positional Param
            components = [{
                type: "body",
                parameters: [{ type: "text", text: "Valued Customer" }]
            }];
        } else if (mode === 'named') {
            // Try 2: Named Param (Matches your PowerShell)
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: "customer_name" // <--- The Magic Key
                }]
            }];
        } else if (mode === 'none') {
            // Try 3: No Params
            components = [];
        }

        const payload = {
            messaging_product: "whatsapp",
            to: targetPhone,
            type: "template",
            template: {
                name: tplName,
                language: { code: "en_US" },
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

    // --- EXECUTE WATERFALL ---
    
    // 1. Try Named Parameters (Since you confirmed this works in PowerShell)
    let result = await attemptSend('named');
    if (!result.error) return success(res, targetPhone);

    console.log("Named param failed. Trying Standard...");
    
    // 2. Try Standard Parameters
    result = await attemptSend('standard');
    if (!result.error) return success(res, targetPhone);

    console.log("Standard param failed. Trying No Params...");

    // 3. Try No Parameters
    result = await attemptSend('none');
    if (!result.error) return success(res, targetPhone);

    // If all failed, show the error from the LAST attempt (likely the most relevant)
    console.error('All Attempts Failed:', JSON.stringify(result.error, null, 2));
    req.flash('error_msg', `Meta Error: ${result.error.message}`);
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