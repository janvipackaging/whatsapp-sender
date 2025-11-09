// --- Imports ---
const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
const MongoStore = require('connect-mongo');

// --- Configs ---
require('./config/passport')(passport); 
const { isAuthenticated, isAdmin } = require('./config/auth'); // <-- 1. IMPORT isAdmin

// --- MODELS (Required for Dashboard data) ---
const Contact = require('./models/Contact'); 
const Campaign = require('./models/Campaign'); 
const Message = require('./models/Message'); 
const Company = require('./models/Company');
const Segment = require('./models/Segment'); 
const User = require('./models/User'); 

// --- CONTROLLERS (Required for routes) ---
const campaignsController = require('./controllers/campaignsController'); 
const reportsController = require('./controllers/reportsController'); 
const inboxController = require('./controllers/inboxController'); 
const blocklistController = require('./controllers/blocklistController'); 


// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); 

// --- Middleware ---
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- SESSION & PASSPORT MIDDLEWARE ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'a_very_strong_secret_key_default_fallback', 
  resave: false,
  saveUninitialized: false, 
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI, 
    collectionName: 'sessions'
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 15 // 15 DAYS
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());


// --- Routes ---

// @route   GET /
// @desc    Show the main "True Dashboard" (PROTECTED)
app.get('/', isAuthenticated, async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalUnread = await Message.countDocuments({ isRead: false, direction: 'inbound' });
    const recentMessages = await Message.find({ isRead: false, direction: 'inbound' })
      .sort({ createdAt: -1 }).limit(3).populate('contact', 'name phone');
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 });
    const companies = await Company.find();
    const segments = await Segment.find();
    const pendingUsers = await User.find({ isApproved: false }).populate('company', 'name'); 

    res.render('index', { 
      totalContacts, totalCampaigns, totalUnread, recentMessages,
      lastCampaign, companies, segments, pendingUsers,
      user: req.user, 
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});


// --- Protected App Routes ---
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns')); 
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 
app.use('/blocklist', isAuthenticated, require('./routes/blocklist')); 
app.use('/segments', isAuthenticated, require('./routes/segments'));

// --- 2. ADD THIS NEW ADMIN-ONLY ROUTE ---
// We use 'isAuthenticated' AND 'isAdmin' to protect it
app.use('/companies', isAuthenticated, isAdmin, require('./routes/companies'));
// --- END OF NEW ROUTE ---

// --- Public/API Routes ---
app.use('/api', require('./routes/api')); 
app.use('/users', require('./routes/users'));


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});