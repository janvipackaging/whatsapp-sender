const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign'); // <-- 1. NEW IMPORT
const { Client } = require("@upstash/qstash");
require('dotenv').config();

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN,
});

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

exports.startCampaign = async (req, res) => {
  const { companyId, segmentId, templateName } = req.body;

  if (!companyId || !segmentId || !templateName) {
    return res.status(400).send('Company, Segment, and Template Name are all required.');
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).send('Company not found.');
    }

    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    });

    if (contacts.length === 0) {
      return res.send(`<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>`);
    }

    // --- 2. CREATE THE CAMPAIGN RECORD ---
    const newCampaign = new Campaign({
      name: templateName, // We'll use the template name as the campaign name
      company: companyId,
      segment: segmentId,
      templateName: templateName,
      totalSent: contacts.length, // We know the total number of contacts
      status: 'Sending'
    });
    await newCampaign.save();
    // --- END OF NEW CODE BLOCK ---

    const destinationUrl = "https://whatsapp-sender-iota.vercel.app/api/send-message";

    let jobsAdded = 0;
    
    for (const contact of contacts) {
      const jobData = {
        contact: contact,
        templateName: templateName,
        companyToken: company.whatsappToken,
        companyNumberId: company.numberId,
        campaignId: newCampaign._id // <-- 3. PASS THE NEW CAMPAIGN ID
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