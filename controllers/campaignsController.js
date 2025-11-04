const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Contact = require('../models/Contact');
const whatsappQueue = require('../services/queue'); // Import your queue

// @desc    Show the "Create New Campaign" page
exports.getCampaignPage = async (req, res) => {
  try {
    // 1. Fetch all companies from the database
    const companies = await Company.find();
    
    // 2. Fetch all segments from the database
    const segments = await Segment.find();
    
    // 3. Render the 'campaigns.ejs' view and pass the data
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
  // 1. Get data from the HTML form
  const { companyId, segmentId, templateName } = req.body;

  // 2. Validate input
  if (!companyId || !segmentId || !templateName) {
    return res.status(400).send('Company, Segment, and Template Name are all required.');
  }

  try {
    // 3. Find the company to get its API token
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).send('Company not found.');
    }

    // 4. Find all contacts that match the selected company AND segment
    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId // This checks if segmentId is in the 'segments' array
    });

    if (contacts.length === 0) {
      return res.send('<h2>No Contacts Found</h2>
                       <p>No contacts were found for that company and segment combination.</p>
                       <a href="/campaigns">Try Again</a>');
    }

    // 5. --- THIS IS THE CORE QUEUE LOGIC ---
    // Create an array of "jobs" to add to the queue
    const jobs = [];
    for (const contact of contacts) {
      jobs.push({
        name: 'send-message', // A name for this type of job
        data: {
          // This 'data' object is exactly what your worker.js file will receive
          contact: contact,
      templateName: templateName,
          companyToken: company.whatsappToken,
          companyNumberId: company.numberId
        }
      });
    }

    // 6. Add all jobs to the queue in one go (very fast)
    await whatsappQueue.addBulk(jobs);

    // 7. Send a success message
    res.send(`<h2>Campaign Started!</h2>
              <p>Successfully added ${contacts.length} messages to the sending queue.</p>
              <p>Your worker process will now send them one by one.</p>
              <a href="/campaigns">Start Another Campaign</a>`);

  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).send('An error occurred while starting the campaign.');
  }
};