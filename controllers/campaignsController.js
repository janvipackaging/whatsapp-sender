const mongoose = require('mongoose'); // Added for ObjectId casting
const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const { Client } = require("@upstash/qstash");
require('dotenv').config();

// Initialize QStash client
const qstash = new Client({ 
  token: process.env.QSTASH_TOKEN 
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
    const [companies, segments, templates] = await Promise.all([
      Company.find().lean(),
      Segment.find().lean(),
      Template.find().lean()
    ]);
    res.render('campaigns', { user: req.user, companies, segments, templates });
  } catch (error) {
    console.error('Error loading campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

/**
 * Start sending a new bulk message campaign
 * UPGRADED: Added strict segment filtering and debug logging to prevent cross-segment sends.
 */
exports.startCampaign = async (req, res) => {
  const { companyId, segmentId, templateId, name } = req.body; 

  if (!companyId || !segmentId || !templateId) { 
    req.flash('error_msg', 'Company, Segment, and Template are required.');
    return res.redirect('/campaigns');
  }

  try {
    // 1. Fetch data with STRICT Segment Filtering
    // We cast segmentId to a proper ObjectId to ensure MongoDB matches precisely within the array
    const [company, template, contacts] = await Promise.all([
      Company.findById(companyId).lean(),
      Template.findById(templateId).lean(),
      Contact.find({ 
        company: companyId, 
        segments: { $in: [new mongoose.Types.ObjectId(segmentId)] } 
      }).lean()
    ]);
    
    // CRITICAL: Verify the count in your Vercel logs
    console.log(`[CAMPAIGN START] User selected Segment: ${segmentId} | Contacts found: ${contacts.length}`);

    if (!company || !template) {
      req.flash('error_msg', 'Selected Company or Template not found.');
      return res.redirect('/campaigns');
    }

    if (!contacts || contacts.length === 0) {
       req.flash('error_msg', 'No contacts found in the selected segment.');
       return res.redirect('/campaigns');
    }

    // 2. Create the Campaign Record for tracking
    const campaignName = name || template.name;
    const tplCodeName = (template.codeName || template.templateName || '').trim();

    const newCampaign = new Campaign({
      name: campaignName, 
      company: companyId,
      segment: segmentId,
      templateName: tplCodeName, 
      totalSent: contacts.length, 
      status: 'Sending'
    });
    await newCampaign.save();

    // 3. Setup QStash Dispatching
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const destinationUrl = `${protocol}://${host}/api/send-message`;

    // 4. Batch dispatch to QStash
    const chunkSize = 20;
    for (let i = 0; i < contacts.length; i += chunkSize) {
      const chunk = contacts.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(contact => {
        return qstash.publishJSON({
          url: destinationUrl,
          body: {
            contact: { ...contact, phone: cleanPhoneForMeta(contact.phone) },
            templateName: tplCodeName, 
            companyToken: company.whatsappToken || company.permanentToken,
            companyNumberId: company.numberId || company.phoneNumberId,
            campaignId: newCampaign._id,
            variableValue: contact.name || 'Customer',
            variableName: template.variable1 || 'name',
            apiVersion: "v17.0"
          },
          retries: 3
        });
      }));
    }

    req.flash('success_msg', `Campaign "${campaignName}" started for ${contacts.length} contacts!`);
    res.redirect('/reports');

  } catch (error) {
    console.error('CRITICAL CAMPAIGN START ERROR:', error);
    req.flash('error_msg', 'Server error while starting the campaign: ' + error.message);
    res.redirect('/campaigns');
  }
};

/**
 * Send a test message
 */
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    let targetPhone = cleanPhoneForMeta(phone || req.body.testPhone);

    const [company, template] = await Promise.all([
      Company.findById(companyId).lean(),
      Template.findById(templateId).lean()
    ]);

    if (!company || !template) {
        req.flash('error_msg', 'Company or Template not found.');
        return res.redirect('/campaigns');
    }

    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    const tplName = (template.codeName || template.templateName || '').trim();
    
    const response = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: targetPhone,
            type: "template",
            template: {
                name: tplName,
                language: { code: "en_US" }, 
                components: [{ 
                    type: "body", 
                    parameters: [{ 
                        type: "text", 
                        text: "Test Customer", 
                        parameter_name: template.variable1 || "name" 
                    }] 
                }]
            }
        })
    });

    const result = await response.json();

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