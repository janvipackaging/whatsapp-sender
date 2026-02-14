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

/**
 * Clean Phone Number for Meta API
 * Removes all non-digits. Adds 91 if it's a 10-digit number.
 */
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
    res.render('campaigns', { user: req.user, companies, segments, templates });
  } catch (error) {
    console.error('Error fetching data for campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

/**
 * Start sending a new bulk message campaign
 * OPTIMIZED: Uses batching (50 at a time) to prevent Vercel Function Timeouts.
 */
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
    const blockedDocs = await Blocklist.find({ company: companyId });
    const blockedPhones = new Set(blockedDocs.map(doc => doc.phone));
    const uniquePhonesInThisRun = new Set();
    const contactsToSend = [];
    
    segmentContacts.forEach(contact => {
        const cleanedPhone = cleanPhoneForMeta(contact.phone);
        if (!blockedPhones.has(contact.phone) && !uniquePhonesInThisRun.has(cleanedPhone)) {
            uniquePhonesInThisRun.add(cleanedPhone);
            contactsToSend.push(contact);
        }
    });

    if (contactsToSend.length === 0) {
      req.flash('error_msg', 'No unique or non-blocked contacts available.');
      return res.redirect('/campaigns');
    }

    // Create Campaign Record
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
    // Match the {{name}} in your Meta Manager
    let varKey = template.variable1 || "name";
    if (templateName.toLowerCase().includes('calculator')) {
        varKey = "name"; 
    }

    // --- BATCH PROCESSING (Fixes Server Error Timeout) ---
    // Send 50 contacts to QStash in parallel at a time
    const batchSize = 50;
    for (let i = 0; i < contactsToSend.length; i += batchSize) {
      const batch = contactsToSend.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (contact) => {
        const cleanedTo = cleanPhoneForMeta(contact.phone);
        return qstashClient.publishJSON({
          url: destinationUrl,
          body: {
            contact: { ...contact.toObject(), phone: cleanedTo },
            templateName: templateName, 
            companyToken: token,
            companyNumberId: phoneId,
            campaignId: newCampaign._id,
            variableValue: contact.name || 'Customer',
            variableName: varKey,
            apiVersion: "v17.0" // Version verified by your PowerShell script
          },
          retries: 3
        });
      }));
    }

    req.flash('success_msg', `Campaign Started! ${contactsToSend.length} unique messages queued.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('Campaign Error:', error);
    req.flash('error_msg', 'Server Error starting campaign. The process may be too large for current settings.');
    res.redirect('/campaigns');
  }
};


// --- TEST SENDER (Matches PowerShell Configuration exactly) ---
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
    if (result.error) {
        result = await attemptSend('standard');
    }

    if (result.error) {
        req.flash('error_msg', `Meta Error: ${result.error.message}`);
    } else {
        req.flash('success_msg', `Test message sent to ${targetPhone} successfully!`);
    }
    res.redirect('/campaigns');

  } catch (error) {
    console.error('Server Error:', error);
    req.flash('error_msg', 'Server Error: ' + error.message);
    res.redirect('/campaigns');
  }
};