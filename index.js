const path = require('path');
require('dotenv').config(); 
const express = require('express');
const session = require('express-session'); 
const flash = require('express-flash');
const passport = require('passport');
const connectDB = require('./db'); 
const MongoStore = require('connect-mongo');

require('./config/passport')(passport); 
const { isAuthenticated, isAdmin } = require('./config/auth'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB(); 

// Essential for Vercel/Cookies
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- CRITICAL FIX: PUBLIC API ROUTE FIRST ---
// This MUST come before the session/passport middleware so QStash isn't blocked by login
app.use('/api', require('./routes/api')); 

// --- AUTHENTICATION SETUP ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'janvi_secret_key_123', 
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60 
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Global Variables
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

// Dashboard Route (Simplified)
const Contact = require('./models/Contact');
const Campaign = require('./models/Campaign');
const Message = require('./models/Message');

app.get('/', isAuthenticated, async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalUnread = await Message.countDocuments({ isRead: false, direction: 'inbound' });
    res.render('index', { totalContacts, totalCampaigns, totalUnread });
  } catch (err) {
    res.status(500).send("Error loading Dashboard");
  }
});

// App Routes
app.use('/contacts', isAuthenticated, require('./routes/contacts'));
app.use('/campaigns', isAuthenticated, require('./routes/campaigns')); 
app.use('/templates', isAuthenticated, require('./routes/templates')); 
app.use('/reports', isAuthenticated, require('./routes/reports')); 
app.use('/inbox', isAuthenticated, require('./routes/inbox')); 
app.use('/users', require('./routes/users'));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});