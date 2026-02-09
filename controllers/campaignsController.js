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

    res.render('campaigns', {
      user: req.user,
      companies: companies,
      segments: segments,
      templates: templates,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
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
    
    // Support both naming conventions for safety
    const templateName = template.codeName || template.templateName || template.name; 

    const segmentContacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (segmentContacts.length === 0) {
       req.flash('error_msg', 'No contacts found in this segment for this company.');
       return res.redirect('/campaigns');
    }
    
    // --- BLOCKLIST CHECK LOGIC ---
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
    // --- END BLOCKLIST CHECK ---

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

    // Handle Token/ID field names safely (Support both versions)
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
        variableValue: contact.name || 'Customer' // Pass name for variables
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


// @desc    Send a single test message
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, phone } = req.body;
    // Handle form naming differences (phone vs testPhone)
    const targetPhone = phone || req.body.testPhone;

    if (!companyId || !templateId || !targetPhone) {
      req.flash('error_msg', 'Company, Template, and Test Phone Number are required.');
      return res.redirect('/campaigns');
    }

    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company) {
        req.flash('error_msg', 'Company not found.');
        return res.redirect('/campaigns');
    }
    if (!template) {
        req.flash('error_msg', 'Template not found.');
        return res.redirect('/campaigns');
    }

    // Handle Token/ID field names safely
    const token = company.permanentToken || company.whatsappToken;
    const phoneId = company.phoneNumberId || company.numberId;

    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    
    const whatsappTemplateName = template.codeName || template.templateName;

    // Construct Payload
    const messageData = {
      messaging_product: "whatsapp",
      to: targetPhone, 
      type: "template",
      template: {
        name: whatsappTemplateName,
        language: { code: "en_US" }, // FORCE US ENGLISH
        components: []
      }
    };

    // --- FIX FOR #100 ERROR (INVALID PARAMETER) ---
    // We check if the template NEEDS a variable.
    // 1. Check if 'variable1' is set in DB.
    // 2. OR Check if 'variables' array is set in DB.
    // 3. OR (Crucial Fix) Check if the name contains "calculator", assume it needs one.
    
    let needsVariable = false;
    if (template.variable1) needsVariable = true;
    if (template.variables && template.variables.length > 0) needsVariable = true;
    if (whatsappTemplateName && whatsappTemplateName.toLowerCase().includes('calculator')) needsVariable = true;

    if (needsVariable) {
        messageData.template.components.push({
            type: "body",
            parameters: [
              {
                type: "text",
                text: "Valued Customer" // Dummy data for test
              }
            ]
        });
    }

    // Log the exact payload for debugging
    console.log("Sending Test Payload:", JSON.stringify(messageData, null, 2));

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Test Message Error:', JSON.stringify(result, null, 2));
      const errorMsg = result.error ? result.error.message : 'Unknown Meta API Error';
      
      if (errorMsg.includes('Invalid parameter')) {
          req.flash('error_msg', 'Meta Error (#100): Template variable mismatch. The App sent 0 or wrong variables, but WhatsApp expected 1.');
      } else if (errorMsg.includes('does not exist')) {
          req.flash('error_msg', 'Meta Error (#132001): Template name or language mismatch. Ensure it is "en_US" in Meta.');
      } else {
          req.flash('error_msg', `Meta Error: ${errorMsg}`);
      }
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