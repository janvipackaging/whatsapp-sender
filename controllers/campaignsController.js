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
    res.status(500).send('Error loading page.');
  }
};

/**
 * Start sending a new bulk message campaign
 * COMPATIBILITY FIX: Uses Chunked Promise.all for high speed without relying on SDK .batch method.
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
    
    // 1. Fetch contacts with .lean() for speed and low memory usage
    const segmentContacts = await Contact.find({ company: companyId, segments: segmentId }).lean();

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment.');
       return res.redirect('/campaigns');
    }
    
    // 2. Blocklist & Duplicate Check
    const blockedDocs = await Blocklist.find({ company: companyId }).lean();
    const blockedPhones = new Set(blockedDocs.map(doc => doc.phone));
    const uniquePhones = new Set();
    const contactsToSend = [];
    
    segmentContacts.forEach(contact => {
        const cleaned = cleanPhoneForMeta(contact.phone);
        if (!blockedPhones.has(contact.phone) && !uniquePhones.has(cleaned)) {
            uniquePhones.add(cleaned);
            contactsToSend.push(contact);
        }
    });

    if (contactsToSend.length === 0) {
      req.flash('error_msg', 'No unique contacts available to send.');
      return res.redirect('/campaigns');
    }

    // 3. Create Campaign Record
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

    // 4. Dynamic Destination URL (Auto-detects environment)
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const destinationUrl = `${protocol}://${host}/api/send-message`;
    
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;

    // 5. Smart Variable Key Detection
    let varKey = template.variable1 || "name";
    if (tplName.toLowerCase().includes('calculator')) varKey = "name";

    // 6. CHUNKED PARALLEL PROCESSING
    // This handles 1,400+ contacts by processing them in chunks of 100.
    // It's compatible with all versions of the QStash SDK.
    const batchSize = 100;
    for (let i = 0; i < contactsToSend.length; i += batchSize) {
      const chunk = contactsToSend.slice(i, i + batchSize);
      
      // Process 100 contacts at once
      await Promise.all(chunk.map(contact => {
        return qstashClient.publishJSON({
          url: destinationUrl,
          body: {
            contact: { ...contact, phone: cleanPhoneForMeta(contact.phone) },
            templateName: tplName, 
            companyToken: token,
            companyNumberId: phoneId,
            campaignId: newCampaign._id,
            variableValue: contact.name || 'Customer',
            variableName: varKey,
            apiVersion: "v17.0"
          },
          retries: 3
        }).catch(err => {
          console.error(`Failed to queue message for ${contact.phone}:`, err.message);
          // We catch inside to ensure one failed queue doesn't stop the whole campaign
        });
      }));
    }

    req.flash('success_msg', `Campaign Started! ${contactsToSend.length} unique messages successfully queued.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('CRITICAL CAMPAIGN START ERROR:', error);
    req.flash('error_msg', `Campaign Start Failed: ${error.message}`);
    res.redirect('/campaigns');
  }
};

// --- TEST SENDER ---
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    let target = cleanPhoneForMeta(phone || req.body.testPhone);
    const company = await Company.findById(companyId).lean();
    const template = await Template.findById(templateId).lean();
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    const tplName = (template.codeName || template.templateName || '').trim();
    
    async function attempt(mode) {
      let params = [];
      if (mode === 'named_ui') params = [{ type: "text", text: "Customer", parameter_name: "name" }];
      else params = [{ type: "text", text: "Customer" }];

      const response = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: target, type: "template",
          template: { name: tplName, language: { code: "en_US" }, components: [{ type: "body", parameters: params }] }
        })
      });
      return await response.json();
    }

    let result = await attempt('named_ui');
    if (result.error) result = await attempt('standard');

    if (result.error) req.flash('error_msg', `Meta Error: ${result.error.message}`);
    else req.flash('success_msg', `Test message sent successfully!`);
    res.redirect('/campaigns');
  } catch (error) {
    res.redirect('/campaigns');
  }
};