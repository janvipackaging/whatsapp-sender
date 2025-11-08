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

// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); 

// --- Middleware ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

// --- ADD SESSION & PASSPORT MIDDLEWARE ---
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
    // 1. Get At-a-Glance Stats
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalUnread = await Message.countDocuments({ isRead: false, direction: 'inbound' });

    // 2. Get Inbox Summary
    const recentMessages = await Message.find({ isRead: false, direction: 'inbound' })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('contact', 'name phone');
      
    // 3. Get Last Campaign Report
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 });

    // 4. Get Data for the "Quick Add" form
    const companies = await Company.find();
    const segments = await Segment.find();
    
    // 5. GET PENDING USERS FOR APPROVAL WIDGET
    const pendingUsers = await User.find({ isApproved: false })
      .populate('company', 'name'); 

    // 6. Render the dashboard with all this data
    res.render('index', { 
      totalContacts,
      totalCampaigns,
      totalUnread,
      recentMessages,
      lastCampaign,
      companies, 
      segments,
      pendingUsers,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});


// --- Other Protected App Routes ---
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns'));
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 

// --- ADD THE BLOCKLIST ROUTE HERE ---
const blocklistRoutes = require('./routes/blocklist'); 
app.use('/blocklist', isAuthenticated, blocklistRoutes); // <-- NEW LINE

// --- Public/API Routes ---
const apiRoutes = require('./routes/api'); 
app.use('/api', apiRoutes);

const userMiddleRoutes = require('./routes/users');
app.use('/users', userMiddleRoutes);


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});