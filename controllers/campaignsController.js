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
    const hasVariable = template.variable1 || (template.variables && template.variables.length > 0);

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


// --- ULTIMATE TEST SENDER (v17.0 + Exhaustive Retry) ---
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
    
    // --- HELPER: Send Request ---
    async function attemptSend(mode, lang = "en_US") {
        let components = [];

        if (mode === 'named') {
            components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: "customer_name" // Explicitly "customer_name"
                }]
            }];
        } else if (mode === 'named_alt') {
             // Try 'name' just in case the template variable is literally named 'name'
             components = [{
                type: "body",
                parameters: [{ 
                    type: "text", 
                    text: "Valued Customer",
                    parameter_name: "name" 
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

    // --- STRATEGY: TRY EVERYTHING UNTIL ONE WORKS ---
    
    // 1. Named Param (Exact PowerShell Match) + en_US
    let result = await attemptSend('named', 'en_US');
    if (!result.error) return success(req, res, targetPhone);

    console.log(`Failed (Named/US): ${result.error.message}. Retrying Standard...`);

    // 2. Standard Param + en_US (Common UI Template)
    result = await attemptSend('standard', 'en_US');
    if (!result.error) return success(req, res, targetPhone);

    // 3. Named Param + en (Language Fallback)
    console.log(`Failed (Standard/US). Retrying 'en' Named...`);
    result = await attemptSend('named', 'en');
    if (!result.error) return success(req, res, targetPhone);

    // 4. No Params (If template has 0 vars)
    console.log(`Failed. Retrying No Params...`);
    result = await attemptSend('none', 'en_US');
    if (!result.error) return success(req, res, targetPhone);

    // If everything failed, show the error from the FIRST attempt (most likely configuration)
    // or the last one if it was a parameter mismatch.
    const finalMsg = result.error ? result.error.message : "Unknown Error";
    console.error('All Attempts Failed.');
    
    req.flash('error_msg', `Meta Error: ${finalMsg}`);
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