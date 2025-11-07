const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template'); // <-- 1. NEW IMPORT
const { Client } = require("@upstash/qstash");
require('dotenv').config();

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN,
});

// @desc    Show the "Create New Campaign" page
exports.getCampaignPage = async (req, res) => {
  try {
    // --- 2. THIS FUNCTION IS UPDATED ---
    const companies = await Company.find();
    const segments = await Segment.find();
    const templates = await Template.find(); // <-- Fetch all templates

    res.render('campaigns', {
      companies: companies,
      segments: segments,
      templates: templates // <-- Pass templates to the EJS page
    });
    // --- END OF UPDATE ---

  } catch (error) {
    console.error('Error fetching data for campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

// @desc    Start sending a new bulk message campaign
exports.startCampaign = async (req, res) => {
  
  // --- 3. THIS FUNCTION IS UPDATED ---
  const { companyId, segmentId, templateId } = req.body; // <-- templateName is now templateId

  if (!companyId || !segmentId || !templateId) { // <-- Check for templateId
    return res.status(400).send('Company, Segment, and Template are all required.');
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).send('Company not found.');
    }

    // --- Find the Template to get its name ---
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).send('Template not found.');
    }
    const templateName = template.templateName; // <-- Get the *real* WhatsApp name
    // --- End of new block ---

    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (contacts.length === 0) {
      return res.send(`<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>`);
    }

    // --- Create the Campaign Record ---
    const newCampaign = new Campaign({
      name: template.name, // <-- Use the user-friendly name
      company: companyId,
      segment: segmentId,
      templateName: templateName, // <-- Use the real WhatsApp name
      totalSent: contacts.length,
      status: 'Sending'
    });
    await newCampaign.save();
    // --- END OF UPDATE ---

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";

    let jobsAdded = 0;
    
    for (const contact of contacts) {
      const jobData = {
        contact: contact,
        templateName: templateName, // <-- Pass the real template name
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