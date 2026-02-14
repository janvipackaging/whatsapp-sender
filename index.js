const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
// REMOVED: const MongoStore = require('connect-mongo'); // Removed to fix 500 Error

require('./config/passport')(passport); 
const { isAuthenticated, isAdmin } = require('./config/auth'); 

const Contact = require('./models/Contact'); 
const Campaign = require('./models/Campaign'); 
const Message = require('./models/Message'); 
const Company = require('./models/Company');
const Segment = require('./models/Segment'); 
const User = require('./models/User'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Connect Database
connectDB(); 

// Vercel Proxy Setting
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- SAFE SESSION SETUP (MemoryStore) ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'janvi_secret_key', 
  resave: false,
  saveUninitialized: false,
  // store: MongoStore... (Removed to prevent crash)
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true on Vercel
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// GLOBAL MIDDLEWARE
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

// --- DASHBOARD ROUTE ---
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
    
    // Safety check for pending users query
    let pendingUsers = [];
    try {
        pendingUsers = await User.find({ isApproved: false }).populate('company', 'name'); 
    } catch (e) {
        console.log("User model might be outdated, skipping pending users query.");
    }

    res.render('index', { 
      totalContacts, totalCampaigns, totalUnread, recentMessages,
      lastCampaign, companies, segments, pendingUsers
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    // Instead of crashing, send a basic error message
    res.status(500).send('Error loading dashboard. Please check logs.');
  }
});

// --- ROUTES ---
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns')); 
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 
app.use('/blocklist', isAuthenticated, require('./routes/blocklist')); 
app.use('/segments', isAuthenticated, require('./routes/segments'));
app.use('/companies', isAuthenticated, isAdmin, require('./routes/companies'));
app.use('/users', require('./routes/users'));

// API ROUTE
app.use('/api', require('./routes/api')); 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});