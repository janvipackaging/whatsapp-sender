const express = require('express');
const router = express.Router();
const passport = require('passport');
const usersController = require('../controllers/usersController');
const { isAuthenticated } = require('../config/auth'); // Import protection middleware

// --- Define Routes ---

// @route   GET /users/login & POST /users/login
router.get('/login', usersController.getLoginPage);
router.post('/login', passport.authenticate('local', {
  successRedirect: '/', 
  failureRedirect: '/users/login', 
  failureFlash: true 
}));

// @route   GET /users/register & POST /users/register
// NOTE: This is now PUBLIC to allow new users to submit a request
router.get('/register', usersController.getRegisterPage);
router.post('/register', usersController.registerUser);

// @route   GET /users/pending
// @desc    Page for users waiting for approval (PUBLIC)
router.get('/pending', usersController.getPendingPage); // <-- NEW ROUTE

// @route   GET /users/approve/:id
// @desc    Secured route for the Admin to click "Approve" (PROTECTED)
router.get('/approve/:id', isAuthenticated, usersController.approveUser); // <-- NEW ROUTE

// @route   GET /users/logout
router.get('/logout', usersController.logoutUser);

module.exports = router;