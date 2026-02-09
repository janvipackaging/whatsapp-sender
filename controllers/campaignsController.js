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

    // FIX: Removed explicit req.flash calls here.
    // The Global Middleware in index.js now handles success_msg/error_msg
    // to prevent them from being consumed twice (which causes silent failures).
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
       req.flash('error_msg', 'No contacts found in this segment for this company.');
       return res.redirect('/campaigns');
    }
    
    // --- BLOCKLIST CHECK ---
    const blockedNumbersDocs = await Blocklist.find({ company: companyId });
    const blockedPhones = new Set(blockedNumbersDocs.map(doc => doc.phone));
    
    let contactsToSend = [];
    let blockedCount = 0;

    segmentContacts.forEach(contact => {
        if (blockedPhones.has(contact.phone)) {
            blockedCount++;
        } else {
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


// --- SMART TEST MESSAGE (AUTO-RETRY) ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    const targetPhone = phone || req.body.testPhone;

    if (!companyId || !templateId || !targetPhone) {
      req.flash('error_msg', 'Company, Template, and Test Phone Number are required.');
      return res.redirect('/campaigns');
    }

    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company) { req.flash('error_msg', 'Company not found.'); return res.redirect('/campaigns'); }
    if (!template) { req.flash('error_msg', 'Template not found.'); return res.redirect('/campaigns'); }

    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    
    const whatsappTemplateName = template.codeName || template.templateName;

    // Helper Function: Try sending with specific settings
    async function trySending(langCode, includeVars) {
        const payload = {
            messaging_product: "whatsapp",
            to: targetPhone, 
            type: "template",
            template: {
                name: whatsappTemplateName,
                language: { code: langCode },
                components: []
            }
        };

        if (includeVars) {
            payload.template.components.push({
                type: "body",
                parameters: [
                    {
                        type: "text",
                        text: "Valued Customer",
                        parameter_name: "customer_name" // Ensure compatibility with strict templates
                    }
                ]
            });
        }

        console.log(`[Test] Attempting: Lang=${langCode}, Vars=${includeVars}`);
        
        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    // --- ATTEMPT 1: Standard (en_US + WITH Variable) ---
    let result = await trySending("en_US", true);

    // --- ERROR HANDLING & RETRY LOGIC ---
    if (result.error) {
        console.log(`Attempt 1 Failed: Code ${result.error.code} - ${result.error.message}`);

        // Error #100: Invalid Parameter 
        // Error #132000: Number of params does not match (Means template wants 0 vars)
        if (result.error.code === 100 || result.error.code === 132000 || result.error.message.includes('parameter')) {
            console.log("Param Mismatch Detected. Retrying WITHOUT variables...");
            result = await trySending("en_US", false);
        }
        
        // Error #132001: Language mismatch
        else if (result.error.code === 132001 || result.error.message.includes('does not exist')) {
            console.log("Language Mismatch Detected. Retrying with 'en' + Vars...");
            result = await trySending("en", true);
            
            // If that fails, try 'en' + No Vars
            if (result.error) {
                 console.log("Retrying 'en' WITHOUT variables...");
                 result = await trySending("en", false);
            }
        }
    }

    // --- FINAL RESULT HANDLING ---
    if (result.error) {
      console.error('Final Test Failure:', JSON.stringify(result.error, null, 2));
      req.flash('error_msg', `Meta Error (${result.error.code}): ${result.error.message}`);
      return res.redirect('/campaigns');
    }

    console.log(`Test message sent successfully to: ${targetPhone}`);
    req.flash('success_msg', `Test message sent to ${targetPhone} successfully!`);
    res.redirect('/campaigns');

  } catch (error) {
    console.error('Error sending test message:', error);
    req.flash('error_msg', 'An error occurred while sending the test.');
    res.redirect('/campaigns');
  }
};