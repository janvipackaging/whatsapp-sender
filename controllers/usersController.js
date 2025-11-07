const User = require('../models/User');
const bcrypt = require('bcryptjs');
const passport = require('passport');

// @desc    Show the login page
exports.getLoginPage = (req, res) => {
  // Pass any flash messages (like "You are now registered")
  res.render('login', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    error: req.flash('error') // passport.js errors
  });
};

// @desc    Show the registration page (FIXED)
exports.getRegisterPage = (req, res) => {
  res.render('register', {
    error: null // <-- ADD THIS LINE: Pass a default 'null' value
  });
};

// @desc    Handle new user registration
exports.registerUser = async (req, res) => {
  try {
    const { username, password, password2 } = req.body;

    // --- Validation ---
    // If there is an error during POST, we pass the error back to the EJS template
    if (!username || !password || !password2) {
      return res.render('register', { error: 'Please fill in all fields' });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.render('register', { error: 'That username is already taken' });
    }

    // Create the new user.
    const newUser = new User({
      username: username,
      password: password
    });

    await newUser.save(); 

    req.flash('success_msg', 'You are now registered and can log in');
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