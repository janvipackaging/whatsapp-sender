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
function cleanPhoneForMeta(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, ''); 
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
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
    const template = await Template.findById(templateId);

    if (!company || !template) {
      req.flash('error_msg', 'Company or Template not found.');
      return res.redirect('/campaigns');
    }
    
    const templateName = (template.codeName || template.templateName || template.name || '').trim();
    const segmentContacts = await Contact.find({ company: companyId, segments: segmentId });

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment.');
       return res.redirect('/campaigns');
    }
    
    // --- BLOCKLIST & DUPLICATE CHECK ---
    const blockedNumbersDocs = await Blocklist.find({ company: companyId });
    const blockedPhones = new Set(blockedNumbersDocs.map(doc => doc.phone));
    const uniquePhonesInThisRun = new Set();
    let contactsToSend = [];
    
    segmentContacts.forEach(contact => {
        const cleanedPhone = cleanPhoneForMeta(contact.phone);
        if (!blockedPhones.has(contact.phone) && !uniquePhonesInThisRun.has(cleanedPhone)) {
            uniquePhonesInThisRun.add(cleanedPhone);
            contactsToSend.push(contact);
        }
    });

    if (contactsToSend.length === 0) {
      req.flash('error_msg', 'No unique/valid contacts available to send.');
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

    // --- SMART VARIABLE DETECTION ---
    // Your Meta UI shows {{name}}. We must send the key "name".
    let varKey = template.variable1 || "name";
    if (templateName.toLowerCase().includes('calculator')) {
        varKey = "name"; // Force "name" for this specific template
    }

    let jobsAdded = 0;
    for (const contact of contactsToSend) { 
      const cleanedTo = cleanPhoneForMeta(contact.phone);
      
      const jobData = {
        contact: { ...contact.toObject(), phone: cleanedTo },
        templateName: templateName, 
        companyToken: token,
        companyNumberId: phoneId,
        campaignId: newCampaign._id,
        // We pass the data so the worker has everything it needs to succeed
        variableValue: contact.name || 'Customer',
        variableName: varKey,
        apiVersion: "v17.0" // Force the version that worked in your script
      };

      await qstashClient.publishJSON({
        url: destinationUrl,
        body: jobData,
        retries: 3
      });
      jobsAdded++;
    }

    req.flash('success_msg', `Campaign Started! ${jobsAdded} unique messages queued.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('Error starting campaign:', error);
    req.flash('error_msg', 'Server Error starting campaign.');
    res.redirect('/campaigns');
  }
};


// --- TEST SENDER (Matches PowerShell Configuration) ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    let targetPhone = cleanPhoneForMeta(phone || req.body.testPhone);

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
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    const tplName = (template.codeName || template.templateName || '').trim();
    
    // Waterfall Strategy
    async function attemptSend(mode) {
        let components = [];
        if (mode === 'named_ui') {
            components = [{ type: "body", parameters: [{ type: "text", text: "Valued Customer", parameter_name: "name" }] }];
        } else if (mode === 'named_db') {
            components = [{ type: "body", parameters: [{ type: "text", text: "Valued Customer", parameter_name: template.variable1 || "customer_name" }] }];
        } else if (mode === 'standard') {
            components = [{ type: "body", parameters: [{ type: "text", text: "Valued Customer" }] }];
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

        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    // Attempt Waterfall
    let result = await attemptSend('named_ui');
    if (!result.error) return success(req, res, targetPhone);

    result = await attemptSend('named_db');
    if (!result.error) return success(req, res, targetPhone);

    result = await attemptSend('standard');
    if (!result.error) return success(req, res, targetPhone);

    req.flash('error_msg', `Meta Error: ${result.error.message}`);
    return res.redirect('/campaigns');

  } catch (error) {
    console.error('Server Error:', error);
    req.flash('error_msg', 'Server Error: ' + error.message);
    res.redirect('/campaigns');
  }
};

function success(req, res, phone) {
    req.flash('success_msg', `Test message sent to ${phone} successfully!`);
    res.redirect('/campaigns');
}