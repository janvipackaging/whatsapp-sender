const User = require('../models/User');
const Company = require('../models/Company');
const passport = require('passport');

// Helper function to find the first company (Janvi Packaging)
const findDefaultCompany = async () => {
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

// @desc    Show the pending approval page
exports.getPendingPage = (req, res) => {
  res.render('pending'); // <-- NEW FUNCTION
};


// @desc    Show the registration page (NO LONGER DISABLED)
exports.getRegisterPage = async (req, res) => {
  try {
    // Pass the company details for the form
    const company = await findDefaultCompany();
    res.render('register', {
      error: null,
      company: company
    });
  } catch (error) {
    console.error('Error loading register page:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
};


// @desc    Handle new user registration
exports.registerUser = async (req, res) => {
  try {
    const { username, password, password2, companyId } = req.body; // companyId is now from the form

    // --- Validation ---
    if (password !== password2) {
      const company = await findDefaultCompany();
      return res.render('register', { error: 'Passwords do not match', company });
    }
    if (password.length < 6) {
      const company = await findDefaultCompany();
      return res.render('register', { error: 'Password must be at least 6 characters', company });
    }
    
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      const company = await findDefaultCompany();
      return res.render('register', { error: 'That username is already taken', company });
    }

    // Determine approval status: ONLY the first user is auto-approved (Super-Admin)
    const userCount = await User.countDocuments();
    const isApproved = userCount === 0; 
    const userRole = userCount === 0 ? 'admin' : 'user';

    // Create the new user.
    const newUser = new User({
      username: username,
      password: password, 
      company: companyId, // Assign company from the form
      isApproved: isApproved, // <-- FALSE for subsequent users
      role: userRole
    });

    await newUser.save(); 

    if (isApproved) {
        req.flash('success_msg', 'Super-Admin account created successfully! Please log in.');
        res.redirect('/users/login');
    } else {
        req.flash('success_msg', 'Registration submitted. Awaiting Admin approval.');
        res.redirect('/users/pending'); // <-- Redirect to pending page
    }

  } catch (error) {
    console.error('Error during registration:', error);
    res.render('register', { error: 'Something went wrong. Please try again.' });
  }
};


// @desc    Admin Approval Action
exports.approveUser = async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Find the user and set approval to true
        await User.findByIdAndUpdate(userId, { isApproved: true });
        
        req.flash('success_msg', 'User approved successfully!');
        res.redirect('/'); // Go back to the dashboard
    } catch (error) {
        console.error('Error approving user:', error);
        req.flash('error_msg', 'Could not approve user.');
        res.redirect('/');
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