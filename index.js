// --- Imports ---
require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 

// --- Models ---
const Contact = require('./models/Contact'); 
const Campaign = require('./models/Campaign'); 
const Message = require('./models/Message'); 
const Company = require('./models/Company');
const Segment = require('./models/Segment'); 
const User = require('./models/User'); 

// --- Configs ---
require('./config/passport')(passport); 
const { isAuthenticated } = require('./config/auth'); 

// --- Controller Functions (Copied for Guaranteed Startup) ---
// We need these controllers here because the routes file is crashing.
const campaignsController = require('./controllers/campaignsController');
const { sendTestMessage, startCampaign, getCampaignPage } = campaignsController;
// --- END Controller Functions ---


// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); 

// --- Middleware ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

// --- SESSION & PASSPORT MIDDLEWARE ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'a_very_strong_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
// --- END OF NEW MIDDLEWARE ---

// --- Routes ---

// @route   GET /
// @desc    Show the main "True Dashboard" (NOW PROTECTED)
app.get('/', isAuthenticated, async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalUnread = await Message.countDocuments({ isRead: false, direction: 'inbound' });
    const recentMessages = await Message.find({ isRead: false, direction: 'inbound' })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('contact', 'name phone');
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 });
    const companies = await Company.find();
    const segments = await Segment.find();
    const pendingUsers = await User.find({ isApproved: false }).populate('company', 'name'); 

    res.render('index', { 
      totalContacts, totalCampaigns, totalUnread, recentMessages,
      lastCampaign, companies, segments, pendingUsers,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});


// --- CAMPAIGN ROUTES (MOVED HERE TO PREVENT CRASH) ---
app.get('/campaigns', isAuthenticated, getCampaignPage); // Show the campaign page
app.post('/campaigns/start', isAuthenticated, startCampaign); // Start the bulk send
app.post('/campaigns/test', isAuthenticated, sendTestMessage); // Send the test message
// --- END CAMPAIGN FIX ---


// --- Other Protected App Routes ---
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 
app.use('/blocklist', isAuthenticated, require('./routes/blocklist')); 

// --- Public/API Routes ---
app.use('/api', require('./routes/api')); 
app.use('/users', require('./routes/users'));


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});