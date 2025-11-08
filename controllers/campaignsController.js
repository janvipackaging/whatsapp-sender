const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Blocklist = require('../models/Blocklist'); // <-- 1. NEW IMPORT
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

    // 2. Fetch all contacts from the segment
    const segmentContacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (segmentContacts.length === 0) {
      return res.send(`<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>`);
    }
    
    // --- 3. BLOCKLIST CHECK LOGIC (NEW) ---
    // Fetch all blocked numbers for this specific company
    const blockedNumbersDocs = await Blocklist.find({ company: companyId });
    const blockedPhones = new Set(blockedNumbersDocs.map(doc => doc.phone));
    
    let contactsToSend = [];
    let blockedCount = 0;

    // Filter out contacts whose phone number is in the blocked list
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
      totalSent: contactsToSend.length, // <-- Update to show actual number sent
      status: 'Sending'
    });
    await newCampaign.save();

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";

    let jobsAdded = 0;
    
    // Send only the filtered list of contactsToSend
    for (const contact of contactsToSend) { // <-- Iterate over contactsToSend
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