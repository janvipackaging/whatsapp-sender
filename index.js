const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
const MongoStore = require('connect-mongo'); // Re-enabled for Vercel stability

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

// Connect to MongoDB
connectDB(); 

// --- VERCEL SPECIFIC SETTING ---
// Trust the first proxy (Vercel/Cloudflare) to allow sessions to persist correctly
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- SESSION CONFIGURATION ---
// Using MongoStore is CRITICAL for Vercel/Serverless so you don't get logged out
app.use(session({
  secret: process.env.SESSION_SECRET || 'janvi_sender_secret_key_2026', 
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60, // Sessions last 14 days
    autoRemove: 'native' 
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
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
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('contact', 'name phone');
      
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 });
    const companies = await Company.find();
    const segments = await Segment.find();
    const pendingUsers = await User.find({ isApproved: false }).populate('company', 'name'); 

    res.render('index', { 
      totalContacts, totalCampaigns, totalUnread, recentMessages,
      lastCampaign, companies, segments, pendingUsers
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).send('Error loading dashboard');
  }
});

// --- ROUTE HANDLERS ---
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns')); 
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 
app.use('/blocklist', isAuthenticated, require('./routes/blocklist')); 
app.use('/segments', isAuthenticated, require('./routes/segments'));
app.use('/companies', isAuthenticated, isAdmin, require('./routes/companies'));
app.use('/api', require('./routes/api')); 
app.use('/users', require('./routes/users'));

// --- GLOBAL ERROR HANDLER ---
// Prevents the "Serverless Function Crashed" white screen
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).render('error', { 
    message: 'Something went wrong on our end.',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});