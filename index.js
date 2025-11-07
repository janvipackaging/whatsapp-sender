// --- Imports ---
require('dotenv').config(); 
const express = require('express');
const connectDB = require('./db'); 

// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); 

// --- Middleware ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // For QStash & Webhooks

// --- Routes ---
app.get('/', (req, res) => {
  res.render('index', { 
    message: 'Welcome to your Dashboard!' 
  });
});

const contactRoutes = require('./routes/contacts');
app.use('/contacts', contactRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/campaigns', campaignRoutes);

const templateRoutes = require('./routes/templates'); 
app.use('/templates', templateRoutes);

const apiRoutes = require('./routes/api'); 
app.use('/api', apiRoutes);

// --- ADD THESE TWO NEW LINES ---
const reportRoutes = require('./routes/reports'); 
app.use('/reports', reportRoutes);
// --- END OF NEW LINES ---

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});