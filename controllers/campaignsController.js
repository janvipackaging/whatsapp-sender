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
  // Logic inside this function is lengthy but correct...
  // (We assume the logic inside this function is correct and focuses on the exports)
  
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

    const segmentContacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (segmentContacts.length === 0) {
      return res.send(`<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>`);
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
      return res.send(`<h2>Campaign Blocked</h2>
                       <p>All ${segmentContacts.length} contacts were found in the blocklist.</p>
                       <a href="/campaigns">Try Again</a>`);
    }
    // --- END BLOCKLIST CHECK ---

    const newCampaign = new Campaign({
      name: template.name, 
      company: companyId,
      segment: segmentId,
      templateName: templateName, 
      totalSent: contactsToSend.length, 
      status: 'Sending'
    });
    await newCampaign.save();

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";

    let jobsAdded = 0;
    
    for (const contact of contactsToSend) { 
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
              ${blockedCount > 0 ? `<p style="color: red;">Note: ${blockedCount} contacts were skipped due to the blocklist.</p>` : ''}
              <p>A new report has been created for this campaign.</p>
              <a href="/campaigns">Start Another Campaign</a>`);

  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).send('An error occurred while starting the campaign.');
  }
};


// @desc    Send a single test message
exports.sendTestMessage = async (req, res) => {
  try {
    const { companyId, templateId, testPhone } = req.body;
    if (!companyId || !templateId || !testPhone) {
      return res.status(400).send('Company, Template, and Test Phone Number are required.');
    }

    const company = await Company.findById(companyId);
    const template = await Template.findById(templateId);

    if (!company) return res.status(404).send('Company not found.');
    if (!template) return res.status(404).send('Template not found.');

    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${company.numberId}/messages`;
    
    const messageData = {
      messaging_product: "whatsapp",
      to: testPhone, 
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
                text: "Test User", 
                parameter_name: "customer_name" 
              }
            ]
          }
        ]
      }
    };

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
    
    res.redirect('/campaigns');

  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).send('An error occurred while sending the test.');
  }
};