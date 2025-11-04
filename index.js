// --- Imports ---
require('dotenv').config(); // Loads .env file content into process.env
const express = require('express');
const connectDB = require('./db'); // Imports your database connection function

// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Connect to Database ---
connectDB(); // Execute the connection function

// --- Middleware ---
// 1. Set EJS as the templating engine
app.set('view engine', 'ejs');

// 2. This line is crucial: It allows your app to read data 
//    sent from your HTML forms (like the CSV upload form).
app.use(express.urlencoded({ extended: false }));

// --- Routes ---
// This is your main "home" route for the admin panel
app.get('/', (req, res) => {
  // This tells Express to find 'views/index.ejs' and send it
  res.render('index', { 
    message: 'Welcome to your Dashboard!' 
  });
});

// We will create these files in the next steps
// This tells Express: "If a URL starts with /contacts, 
// use the routes defined in './routes/contacts.js'"
const contactRoutes = require('./routes/contacts');
app.use('/contacts', contactRoutes);

// "If a URL starts with /campaigns,
// use the routes defined in './routes/campaigns.js'"
const campaignRoutes = require('./routes/campaigns');
app.use('/campaigns', campaignRoutes);


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running successfully on http://localhost:${PORT}`);
});