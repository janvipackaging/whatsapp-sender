const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
const MongoStore = require('connect-mongo'); // REQUIRED for Vercel

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

// Trust Proxy for Vercel (Critical for Cookies)
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- ROBUST SESSION SETUP ---
// We use MongoStore. If this fails, the app will crash intentionally 
// because MemoryStore cannot work on Vercel (you will get logged out instantly).
app.use(session({
  secret: process.env.SESSION_SECRET || 'janvi_secret_key_secure', 
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI, 
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Must be true on Vercel https
    maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
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
    // Wrap queries in Promise.all for speed and error handling
    const [totalContacts, totalCampaigns, totalUnread] = await Promise.all([
        Contact.countDocuments(),
        Campaign.countDocuments(),
        Message.countDocuments({ isRead: false, direction: 'inbound' })
    ]);
    
    // Fetch lists separately to avoid partial failures
    const companies = await Company.find().lean();
    const segments = await Segment.find().lean();
    const lastCampaign = await Campaign.findOne().sort({ createdAt: -1 }).lean();
    
    const recentMessages = await Message.find({ isRead: false, direction: 'inbound' })
      .sort({ createdAt: -1 }).limit(3).populate('contact', 'name phone').lean();

    // Pending users check
    let pendingUsers = [];
    if (req.user.role === 'admin') {
        pendingUsers = await User.find({ isApproved: false }).populate('company', 'name').lean();
    }

    res.render('index', { 
      totalContacts, totalCampaigns, totalUnread, recentMessages,
      lastCampaign, companies, segments, pendingUsers
    });

  } catch (error) {
    console.error("Dashboard Load Error:", error);
    res.status(500).send(`Error loading dashboard: ${error.message}`);
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
app.use('/api', require('./routes/api')); 

// --- SERVER STARTUP (Wait for DB) ---
connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error("Failed to connect to DB, server not started:", err);
});