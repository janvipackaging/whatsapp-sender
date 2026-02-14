const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 

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

// Connect to Database (Non-blocking start)
connectDB(); 

// Trust Proxy for Vercel (Critical for Cookies)
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- ROBUST SESSION SETUP (With Auto-Fallback) ---
let sessionStore;
try {
  // Only try MongoStore if URI exists
  if (process.env.MONGO_URI) {
    const MongoStore = require('connect-mongo');
    sessionStore = MongoStore.create({ 
      mongoUrl: process.env.MONGO_URI, 
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 days
    });
    console.log("Using MongoStore for sessions.");
  } else {
    console.warn("MONGO_URI missing. Falling back to MemoryStore.");
  }
} catch (e) {
  console.warn("Session Store Error (Using MemoryStore fallback):", e.message);
  // sessionStore remains undefined, Express uses MemoryStore by default
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'janvi_secret_key_secure', 
  resave: false,
  saveUninitialized: false,
  store: sessionStore, // Will use Mongo if available, Memory if not
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

// --- SERVER STARTUP (Immediate) ---
// We do not wait for DB connection here to prevent Vercel timeouts.
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});