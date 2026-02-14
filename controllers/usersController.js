const User = require('../models/User');
const Company = require('../models/Company');
const passport = require('passport');
const bcrypt = require('bcryptjs');

// --- LOGIN & REGISTER ---
exports.getLoginPage = (req, res) => {
  res.render('login', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    error: req.flash('error')
  });
};

exports.loginHandle = (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/users/login',
    failureFlash: true
  })(req, res, next);
};

exports.getRegisterPage = async (req, res) => {
  const companies = await Company.find({});
  res.render('register', { companies });
};

exports.registerHandle = async (req, res) => {
  const { username, password, password2, companyId } = req.body;
  let errors = [];

  if (!username || !password || !password2 || !companyId) {
    errors.push({ msg: 'Please enter all fields' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }
  if (password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters' });
  }

  if (errors.length > 0) {
    const companies = await Company.find({});
    return res.render('register', { errors, username, password, companies, error: errors[0].msg });
  }

  try {
    const userExists = await User.findOne({ username: username });
    if (userExists) {
      const companies = await Company.find({});
      return res.render('register', { companies, error_msg: 'Username already exists', username });
    }

    const newUser = new User({
      username,
      password,
      company: companyId,
      role: 'user',
      isApproved: false // Default to pending
    });

    // Hash Password
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(newUser.password, salt, async (err, hash) => {
        if (err) throw err;
        newUser.password = hash;
        await newUser.save();
        res.render('pending'); // Redirect to pending page
      });
    });
  } catch (err) {
    console.error(err);
    res.redirect('/users/register');
  }
};

exports.logoutHandle = (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
  });
};

// --- PROFILE ---
exports.getProfilePage = (req, res) => {
  res.render('profile', { user: req.user });
};

exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if(newPassword !== confirmPassword) {
      req.flash('error_msg', 'New passwords do not match');
      return res.redirect('/users/profile');
  }
  try {
      const user = await User.findById(req.user._id);
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if(!isMatch) {
          req.flash('error_msg', 'Current password is incorrect');
          return res.redirect('/users/profile');
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();
      req.flash('success_msg', 'Password updated successfully');
      res.redirect('/users/profile');
  } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Error updating password');
      res.redirect('/users/profile');
  }
};

// --- ADMIN MANAGEMENT FUNCTIONS (These were missing!) ---

exports.getManageUsersPage = async (req, res) => {
  try {
    const users = await User.find({}).populate('company');
    const companies = await Company.find({});
    res.render('manage-users', { users, companies, user: req.user });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};

exports.addUser = async (req, res) => {
  // Admin add user logic
  const { username, email, password, companyId, role } = req.body;
  try {
      const newUser = new User({
          username, email, password, company: companyId, role, isApproved: true
      });
      const salt = await bcrypt.genSalt(10);
      newUser.password = await bcrypt.hash(password, salt);
      await newUser.save();
      req.flash('success_msg', 'User added successfully');
      res.redirect('/users/manage');
  } catch(err) {
      console.error(err);
      req.flash('error_msg', 'Error adding user');
      res.redirect('/users/manage');
  }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        user.isApproved = !user.isApproved;
        await user.save();
        req.flash('success_msg', `User ${user.username} is now ${user.isApproved ? 'Active' : 'Disabled'}`);
        res.redirect('/users/manage');
    } catch (err) {
        console.error(err);
        res.redirect('/users/manage');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'User deleted');
        res.redirect('/users/manage');
    } catch (err) {
        console.error(err);
        res.redirect('/users/manage');
    }
};

exports.approveUser = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { isApproved: true });
        req.flash('success_msg', 'User Approved');
        res.redirect('/');
    } catch (err) { res.redirect('/'); }
};

exports.declineUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'User Declined and Removed');
        res.redirect('/');
    } catch (err) { res.redirect('/'); }
};