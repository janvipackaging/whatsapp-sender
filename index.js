// --- Imports ---
require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport'); // <-- 1. NEW IMPORT
const connectDB = require('./db'); 

// --- Configs ---
require('./config/passport')(passport); // <-- 2. LOAD PASSPORT CONFIG
const { isAuthenticated } = require('./config/auth'); // <-- 3. IMPORT PAGE PROTECTION

// --- Models (for Dashboard) ---
const Contact = require('./models/Contact'); 
const Campaign = require('./models/Campaign'); 
const Message = require('./models/Message'); 
const Company = require('./models/Company');
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

// --- 4. ADD SESSION & PASSPORT MIDDLEWARE ---
// This must be *before* your routes
app.use(session({
  secret: process.env.SESSION_SECRET || 'a_very_strong_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60000 } // Flash message cookie
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Flash middleware
app.use(flash());
// --- END OF NEW MIDDLEWARE ---

// --- Routes ---

// --- 5. NEW PUBLIC USER ROUTES ---
// These routes are *public* (you don't need to be logged in)
app.use('/users', require('./routes/users'));

// --- 6. PROTECTED APPLICATION ROUTES ---
// All routes below this point will *require* the user to be logged in.
// We add 'isAuthenticated' to every single route we want to protect.

// @route   GET /
// @desc    Show the main "True Dashboard" (NOW PROTECTED)
app.get('/', isAuthenticated, async (req, res) => { // <-- Added 'isAuthenticated'
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

    res.render('index', { 
      totalContacts,
      totalCampaigns,
      totalUnread,
      recentMessages,
      lastCampaign,
      companies,
      segments,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});

// All other app routes are also protected
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns'));
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 

// The API routes do not need user login, they are protected by webhooks/tokens
app.use('/api', require('./routes/api')); 

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});