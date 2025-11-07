const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const { Client } = require("@upstash/qstash"); // <-- NEW IMPORT
require('dotenv').config();

// --- NEW QSTASH CLIENT ---
// It automatically reads your .env variables
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN,
});

// @desc    Show the "Create New Campaign" page
exports.getCampaignPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();
    
    res.render('campaigns', {
      companies: companies,
      segments: segments
    });

  } catch (error) {
    console.error('Error fetching data for campaign page:', error);
    res.status(500).send('Error loading page.');
  }
};

// @desc    Start sending a new bulk message campaign
exports.startCampaign = async (req, res) => {
  const { companyId, segmentId, templateName } = req.body;

  if (!companyId || !segmentId || !templateName) {
    return res.status(400).send('Company, Segment, and Template Name are all required.');
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(4SAP).send('Company not found.');
    }

    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (contacts.length === 0) {
      return res.send('<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>');
    }

    // --- THIS IS THE NEW QSTASH LOGIC ---
    //
    // This is your live Vercel URL.
    //
    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message"; // <-- UPDATED

    let jobsAdded = 0;
    
    // We must send one request to QStash for *each* contact.
    for (const contact of contacts) {
      const jobData = {
        contact: contact,
        templateName: templateName,
        companyToken: company.whatsappToken,
        companyNumberId: company.numberId
      };

      // Publish the job to QStash
      await qstashClient.publishJSON({
        url: destinationUrl, // The URL QStash will call
        body: jobData,        // The data to send
        retries: 3            // Automatically retry if it fails
      });
      jobsAdded++;
    }
    // --- END OF NEW LOGIC ---

    res.send(`<h2>Campaign Started!</h2>
              <p>Successfully added ${jobsAdded} messages to the QStash queue.</p>
              <p>QStash will now send them to your Vercel app one by one.</p>
              <a href="/campaigns">Start Another Campaign</a>`);

  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).send('An error occurred while starting the campaign.');
  }
};