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
 * ULTIMATE OPTIMIZATION: Uses QStash Batching to handle 1,000+ contacts without timeout.
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
    
    // 1. Fetch contacts with .lean() for speed
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

    // --- FIX: Dynamic Destination URL ---
    // Automatically detects if you are on localhost, vercel.app, or your custom domain
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const destinationUrl = `${protocol}://${host}/api/send-message`;
    
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;

    // 4. Smart Variable Key Detection
    let varKey = template.variable1 || "name";
    if (tplName.toLowerCase().includes('calculator')) varKey = "name";

    // 5. QSTASH BATCHING (The Fix for 1,400 contacts)
    const batchSize = 100;
    for (let i = 0; i < contactsToSend.length; i += batchSize) {
      const batch = contactsToSend.slice(i, i + batchSize);
      
      const qstashMessages = batch.map(contact => ({
        url: destinationUrl,
        // Pass body as an object - the SDK handles stringification automatically
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
      }));

      // Send the batch to QStash
      await qstashClient.batch.publish(qstashMessages);
    }

    req.flash('success_msg', `Campaign Started! ${contactsToSend.length} unique messages queued via High-Speed Batching.`);
    res.redirect('/reports');

  } catch (error) {
    console.error('CRITICAL CAMPAIGN START ERROR:', error);
    // Show actual error message for better debugging
    req.flash('error_msg', `Campaign Start Failed: ${error.message || 'Check QStash Token and Logs'}`);
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