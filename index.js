// --- Imports ---
require('dotenv').config(); 
const express = require('express');
const connectDB = require('./db'); 
const Contact = require('./models/Contact'); 
const Campaign = require('./models/Campaign'); 
const Message = require('./models/Message'); 
const Company = require('./models/Company'); // <-- THIS LINE IS NOW FIXED
const Segment = require('./models/Segment'); 

// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); 

// --- Middleware ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // For QStash & Webhooks

// --- Routes ---

// @route   GET /
// @desc    Show the main "True Dashboard"
app.get('/', async (req, res) => {
  try {
    // 1. Get At-a-Glance Stats
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalUnread = await Message.countDocuments({ isRead: false, direction: 'inbound' });

    // 2. Get Inbox Summary (last 3 unread messages)
    const recentMessages = await Message.find({ isRead: false, direction: 'inbound' })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('contact', 'name phone');
      
    // 3. Get Last Campaign Report
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 });

    // 4. Get Data for the "Quick Add" form
    const companies = await Company.find();
    const segments = await Segment.find();

    // 5. Render the dashboard with all this data
    res.render('index', { 
      totalContacts,
      totalCampaigns,
      totalUnread,
      recentMessages,
      lastCampaign,
      companies, // For the form
      segments   // For the form
    });

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});


// --- Other Routes ---
const contactRoutes = require('./routes/contacts');
app.use('/contacts', contactRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/campaigns', campaignRoutes);

const templateRoutes = require('./routes/templates'); 
app.use('/templates', templateRoutes);

const reportRoutes = require('./routes/reports'); 
app.use('/reports', reportRoutes);

const inboxRoutes = require('./routes/inbox'); 
app.use('/inbox', inboxRoutes);

const apiRoutes = require('./routes/api'); 
app.use('/api', apiRoutes);

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});