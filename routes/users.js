const express = require('express');
const router = express.Router();
const passport = require('passport');

// We will create this controller file next
const usersController = require('../controllers/usersController');

// --- Define Routes ---

// @route   GET /users/login
// @desc    Show the login page
router.get('/login', usersController.getLoginPage);

// @route   POST /users/login
// @desc    Handle the login form submission
router.post('/login', passport.authenticate('local', {
  successRedirect: '/', // On success, go to the main dashboard
  failureRedirect: '/users/login', // On failure, stay on the login page
  failureFlash: true // Use flash messages for errors
}));

// @route   GET /users/register
// @desc    Show the registration page (for creating the first user)
router.get('/register', usersController.getRegisterPage);

// @route   POST /users/register
// @desc    Handle the registration form submission
router.post('/register', usersController.registerUser);

// @route   GET /users/logout
// @desc    Handle logging out
router.get('/logout', usersController.logoutUser);

module.exports = router;