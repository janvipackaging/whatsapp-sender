const User = require('../models/User');
const Company = require('../models/Company'); // New Import
const passport = require('passport');

// Helper function to find the first company (Janvi Packaging)
const findDefaultCompany = async () => {
  // Assuming Janvi Packaging is the first company created in the database
  const company = await Company.findOne().sort({ createdAt: 1 });
  if (!company) {
    throw new Error("CRITICAL ERROR: No Company found in database. Please add a Company in MongoDB Compass first.");
  }
  return company;
};

// @desc    Show the login page
exports.getLoginPage = (req, res) => {
  res.render('login', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    error: req.flash('error') 
  });
};

// @desc    Show the registration page
exports.getRegisterPage = async (req, res) => {
  try {
    // Check if any user exists. If yes, registration is disabled (404).
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      // You must implement the 'Pending' page redirection here later.
      // For now, we will just show a standard message.
      return res.send(`<h2>Registration Disabled</h2>
                       <p>Admin registration is complete. Please log in.</p>
                       <a href="/users/login">Go to Login</a>`);
    }
    
    // Pass the company details for the form
    const company = await findDefaultCompany();
    res.render('register', {
      error: null,
      company: company // Pass company details to the view
    });
  } catch (error) {
    console.error('Error loading register page:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
};

// @desc    Handle new user registration
exports.registerUser = async (req, res) => {
  try {
    const { username, password, password2 } = req.body;

    // Check if Super-Admin already exists (Security Gate)
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return res.status(403).send("Registration is closed.");
    }
    
    // --- Validation and Setup ---
    if (password !== password2) {
      return res.render('register', { error: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Password must be at least 6 characters' });
    }
    const company = await findDefaultCompany();

    // Create the new user. First user is auto-approved as Admin.
    const newUser = new User({
      username: username,
      password: password, // Will be auto-hashed by User model
      company: company._id,
      isApproved: true, // Auto-approve the first user (Super-Admin)
      role: 'admin'
    });

    await newUser.save(); 

    req.flash('success_msg', 'Admin account created successfully! Please log in.');
    res.redirect('/users/login');

  } catch (error) {
    console.error('Error during registration:', error);
    res.render('register', { error: 'Something went wrong. Please try again.' });
  }
};

// @desc    Handle user logout
exports.logoutUser = (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
  });
};