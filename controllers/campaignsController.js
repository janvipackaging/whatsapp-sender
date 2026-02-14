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
    const companies = await Company.find().lean();
    const segments = await Segment.find().lean();
    const templates = await Template.find().lean(); 
    res.render('campaigns', { user: req.user, companies, segments, templates });
  } catch (error) {
    console.error('Error loading campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

/**
 * Start sending a new bulk message campaign
 * OPTIMIZED: Uses .lean() for memory efficiency and larger parallel batches.
 */
exports.startCampaign = async (req, res) => {
  const { companyId, segmentId, templateId, name } = req.body; 

  if (!companyId || !segmentId || !templateId) { 
    req.flash('error_msg', 'Company, Segment, and Template are required.');
    return res.redirect('/campaigns');
  }

  try {
    const company = await Company.findById(companyId).lean();
    const template = await Template.findById(templateId).lean();
    
    if (!company || !template) {
      req.flash('error_msg', 'Selected Company or Template not found.');
      return res.redirect('/campaigns');
    }
    
    // FETCH CONTACTS: Use .lean() for 1,400 contacts to prevent memory bloat
    const segmentContacts = await Contact.find({ company: companyId, segments: segmentId }).lean();

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment.');
       return res.redirect('/campaigns');
    }
    
    // --- BLOCKLIST & DUPLICATE CHECK ---
    const blockedDocs = await Blocklist.find({ company: companyId }).lean();
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
      req.flash('error_msg', 'No unique or non-blocked contacts available in this segment.');
      return res.redirect('/campaigns');
    }

    // Create Campaign Record
    const tplName = (template.codeName || template.templateName || template.name || '').trim();
    const newCampaign = new Campaign({
      name: name || template.name, 
      company: companyId,
      segment: segmentId,
      templateName: tplName, 
      totalSent: contactsToSend.length, 
      status: 'Sending'
    });
    await newCampaign.save();

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;

    // --- SMART VARIABLE DETECTION ---
    let varKey = template.variable1 || "name";
    if (tplName.toLowerCase().includes('calculator')) {
        varKey = "name"; 
    }

    // --- BATCH PROCESSING (Fixed to avoid Vercel timeouts) ---
    // Batch size of 100 is efficient for hand-off to QStash
    const batchSize = 100;
    for (let i = 0; i < contactsToSend.length; i += batchSize) {
      const batch = contactsToSend.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (contact) => {
        const cleanedTo = cleanPhoneForMeta(contact.phone);
        // We don't need a heavy try-catch inside the map here because 
        // publishJSON failure will hit the outer catch block.
        return qstashClient.publishJSON({
          url: destinationUrl,
          body: {
            contact: { ...contact, phone: cleanedTo },
            templateName: tplName, 
            companyToken: token,
            companyNumberId: phoneId,
            campaignId: newCampaign._id,
            variableValue: contact.name || 'Customer',
            variableName: varKey,
            apiVersion: "v17.0"
          },
          retries: 3
        });
      }));
    }

    req.flash('success_msg', `Campaign Started! ${contactsToSend.length} unique messages queued for processing.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('CRITICAL CAMPAIGN START ERROR:', error);
    // Provide a more descriptive error message to the user
    const errorMsg = error.message.includes('QSTASH') 
      ? 'Error communicating with background worker (QStash). Check your token.'
      : 'Server Error starting campaign. The process might be too large or database connection was lost.';
    
    req.flash('error_msg', errorMsg);
    res.redirect('/campaigns');
  }
};

// --- TEST SENDER ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    let targetPhone = cleanPhoneForMeta(phone || req.body.testPhone);

    const company = await Company.findById(companyId).lean();
    const template = await Template.findById(templateId).lean();

    if (!company || !template) {
        req.flash('error_msg', 'Company or Template not found.');
        return res.redirect('/campaigns');
    }

    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    const tplName = (template.codeName || template.templateName || '').trim();
    
    async function attemptSend(mode) {
        let params = [];
        if (mode === 'named_ui') params = [{ type: "text", text: "Customer", parameter_name: "name" }];
        else if (mode === 'standard') params = [{ type: "text", text: "Customer" }];

        const payload = {
            messaging_product: "whatsapp",
            to: targetPhone,
            type: "template",
            template: {
                name: tplName,
                language: { code: "en_US" }, 
                components: [{ type: "body", parameters: params }]
            }
        };

        const response = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    let result = await attemptSend('named_ui');
    if (result.error) result = await attemptSend('standard');

    if (result.error) {
        req.flash('error_msg', `Meta Error: ${result.error.message}`);
    } else {
        req.flash('success_msg', `Test message sent to ${targetPhone} successfully!`);
    }
    res.redirect('/campaigns');

  } catch (error) {
    console.error('Test Send Error:', error);
    req.flash('error_msg', 'Server Error: ' + error.message);
    res.redirect('/campaigns');
  }
};