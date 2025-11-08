const User = require('../models/User');
const Company = require('../models/Company');
const passport = require('passport');
const bcrypt = require('bcryptjs');

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
  res.render('pending');
};


// @desc    Show the registration page
// --- UPDATED FOR MULTI-COMPANY ---
exports.getRegisterPage = async (req, res) => {
  try {
    // 1. Fetch all companies to show in the dropdown
    const companies = await Company.find().sort({ name: 1 });
    if (companies.length === 0) {
      return res.status(500).send(`Error: No companies have been created in the database. Please add a company via MongoDB Compass before registering a user.`);
    }
    
    // 2. Pass all companies to the view
    res.render('register', {
      error: null,
      companies: companies // Pass the full list
    });
  } catch (error) {
    console.error('Error loading register page:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
};


// @desc    Handle new user registration
// --- UPDATED FOR MULTI-COMPANY & VALIDATION ---
exports.registerUser = async (req, res) => {
  const { username, password, password2, companyId } = req.body;
  const companies = await Company.find().sort({ name: 1 }); // Re-fetch companies for error re-render

  try {
    // --- Validation ---
    if (!username || !password || !password2 || !companyId) {
      return res.render('register', { error: 'Please fill in all fields', companies });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Passwords do not match', companies });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Password must be at least 6 characters', companies });
    }
    
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.render('register', { error: 'That username is already taken', companies });
    }

    // Determine approval status: ONLY the first user is auto-approved
    const userCount = await User.countDocuments();
    const isApproved = userCount === 0; 
    const userRole = userCount === 0 ? 'admin' : 'user';

    // Create the new user.
    const newUser = new User({
      username: username,
      password: password, 
      company: companyId, // Assign company from the form
      isApproved: isApproved, // FALSE for subsequent users
      role: userRole
    });

    await newUser.save(); 

    if (isApproved) {
        req.flash('success_msg', 'Super-Admin account created successfully! Please log in.');
        res.redirect('/users/login');
    } else {
        // We don't flash a message here, the pending page *is* the message
        res.redirect('/users/pending'); // Redirect to pending page
    }

  } catch (error) {
    console.error('Error during registration:', error);
    res.render('register', { error: 'Something went wrong. Please try again.', companies });
  }
};


// @desc    Admin Approval Action
exports.approveUser = async (req, res) => {
    try {
        const userId = req.params.id;
        // Only an admin can do this (add check later if needed)
        await User.findByIdAndUpdate(userId, { isApproved: true });
        
        req.flash('success_msg', 'User approved successfully!');
        res.redirect('/'); // Go back to the dashboard
    } catch (error) {
        console.error('Error approving user:', error);
        req.flash('error_msg', 'Could not approve user.');
        res.redirect('/');
    }
};

// ---
// --- NEW FUNCTION 1: DECLINE USER ---
// ---
// @desc    Admin Decline Action
exports.declineUser = async (req, res) => {
  try {
      const userId = req.params.id;
      // Find and delete the user request
      await User.findByIdAndDelete(userId);
      
      req.flash('success_msg', 'User request declined and deleted.');
      res.redirect('/'); // Go back to the dashboard
  } catch (error) {
      console.error('Error declining user:', error);
      req.flash('error_msg', 'Could not decline user.');
      res.redirect('/');
  }
};

// ---
// --- NEW FUNCTION 2: MANAGE USERS PAGE ---
// ---
// @desc    Show the Manage Users page
exports.getManageUsersPage = async (req, res) => {
  try {
    // Find all users *except* the currently logged-in admin
    const users = await User.find({ _id: { $ne: req.user._id } })
      .populate('company', 'name')
      .sort({ createdAt: -1 });

    res.render('manage-users', {
      users: users,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error loading page');
  }
};

// ---
// --- NEW FUNCTION 3: TOGGLE USER PERMISSION ---
// ---
// @desc    Revoke or Grant permission for an existing user
exports.toggleUserApproval = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      req.flash('error_msg', 'User not found.');
      return res.redirect('/users/manage');
    }
    
    // Flip the approval status
    user.isApproved = !user.isApproved;
    await user.save();
    
    req.flash('success_msg', `User ${user.username} has been ${user.isApproved ? 'Enabled' : 'Disabled'}.`);
    res.redirect('/users/manage');

  } catch (error) {
    console.error('Error toggling user approval:', error);
    req.flash('error_msg', 'Could not update user status.');
    res.redirect('/users/manage');
  }
};


// ---
// --- NEW FUNCTION 4: ADMIN PASSWORD RESET ---
// ---
// @desc    Show the profile/password change page
exports.getProfilePage = (req, res) => {
  res.render('profile', {
    user: req.user, // Pass the logged-in user
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg')
  });
};

// @desc    Handle updating the password
exports.updatePassword = async (req, res) => {
  const { oldPassword, newPassword, newPassword2 } = req.body;
  const user = await User.findById(req.user.id);

  // 1. Check if new passwords match
  if (newPassword !== newPassword2) {
    req.flash('error_msg', 'New passwords do not match.');
    return res.redirect('/users/profile');
  }

  // 2. Check if new password is long enough
  if (newPassword.length < 6) {
    req.flash('error_msg', 'New password must be at least 6 characters.');
    return res.redirect('/users/profile');
  }

  // 3. Check if old password is correct
  const isMatch = await user.matchPassword(oldPassword);
  if (!isMatch) {
    req.flash('error_msg', 'Old password incorrect.');
    return res.redirect('/users/profile');
  }
  
  // 4. All checks passed. Save the new password.
  // The 'save' hook in User.js will automatically hash it.
  user.password = newPassword;
  await user.save();
  
  req.flash('success_msg', 'Password updated successfully. Please log in again.');
  req.logout((err) => { // Log them out for security
    if (err) { return next(err); }
    res.redirect('/users/login');
  });
};


// @desc    Handle user logout
exports.logoutUser = (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
  });
};