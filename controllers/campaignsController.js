const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const { Client } = require("@upstash/qstash");
const fetch = require('node-fetch'); // <-- 1. NEW IMPORT
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
  
  const { companyId, segmentId, templateId } = req.body; 

  if (!companyId || !segmentId || !templateId) { 
    return res.status(400).send('Company, Segment, and Template are all required.');
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).send('Company not found.');
    }

    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).send('Template not found.');
    }
    const templateName = template.templateName; 

    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (contacts.length === 0) {
      return res.send(`<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>`);
    }

    const newCampaign = new Campaign({
      name: template.name, 
      company: companyId,
      segment: segmentId,
      templateName: templateName, 
      totalSent: contacts.length,
      status: 'Sending'
    });
    await newCampaign.save();

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";

    let jobsAdded = 0;
    
    for (const contact of contacts) {
      const jobData = {
        contact: contact,
        templateName: templateName, 
        companyToken: company.whatsappToken,
        companyNumberId: company.numberId,
        campaignId: newCampaign._id 
      };

      await qstashClient.publishJSON({
        url: destinationUrl,
        body: jobData,
        retries: 3
      });
      jobsAdded++;
    }

    res.send(`<h2>Campaign Started!</h2>
              <p>Successfully added ${jobsAdded} messages to the QStash queue.</p>
              <p>A new report has been created for this campaign.</p>
              <a href="/campaigns">Start Another Campaign</a>`);

  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).send('An error occurred while starting the campaign.');
  }
};


// ---
// --- 2. THIS IS THE NEW FUNCTION ---
// ---
// @desc    Send a single test message
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, testPhone } = req.body;

    // 1. Validate input
    if (!companyId || !templateId || !testPhone) {
      return res.status(400).send('Company, Template, and Test Phone Number are required.');
    }

    // 2. Get Company and Template details
    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company) return res.status(404).send('Company not found.');
    if (!template) return res.status(404).send('Template not found.');

    // 3. Build the same payload as our apiController
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${company.numberId}/messages`;
    
    const messageData = {
      messaging_product: "whatsapp",
      to: testPhone, // Send to the test phone number
      type: "template",
      template: {
        name: template.templateName,
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                // For a test, we can just send "Test" as the variable
                text: "Test User", 
                parameter_name: "customer_name" 
              }
            ]
          }
        ]
      }
    };

    // 4. Send the message directly
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${company.whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Test Message Error:', JSON.stringify(result.error, null, 2));
      return res.status(500).send(`Error sending test: ${result.error.message}`);
    }

    console.log(`Test message sent successfully to: ${testPhone}`);
    
    // 5. Redirect back to the campaign page
    res.redirect('/campaigns');

  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).send('An error occurred while sending the test.');
  }
};