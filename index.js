const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
// REMOVED: const MongoStore = require('connect-mongo');

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

connectDB(); 

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- SESSION (Reverted to MemoryStore for stability) ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret', 
  resave: false,
  saveUninitialized: false, 
  // removed store: MongoStore... to prevent crash if mongo fails
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// GLOBAL MIDDLEWARE (Kept this, it works great)
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

// Routes
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
      lastCampaign, companies, segments, pendingUsers
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send('Error loading dashboard');
  }
});

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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});