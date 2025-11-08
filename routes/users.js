const express = require('express');
const router = express.Router();
const passport = require('passport');
const usersController = require('../controllers/usersController');
const { isAuthenticated } = require('../config/auth'); // Import protection middleware

// --- Define Routes ---

// @route   GET /users/login & POST /users/login (Public)
router.get('/login', usersController.getLoginPage);
router.post('/login', passport.authenticate('local', {
  successRedirect: '/', 
  failureRedirect: '/users/login', 
  failureFlash: true 
}));

// @route   GET /users/register & POST /users/register (Public)
// This is now the "Request Account" page
router.get('/register', usersController.getRegisterPage);
router.post('/register', usersController.registerUser);

// @route   GET /users/pending (Public)
// Page for users waiting for approval
router.get('/pending', usersController.getPendingPage);

// @route   GET /users/logout (Public)
router.get('/logout', usersController.logoutUser);


// --- PROTECTED ADMIN ROUTES ---
// These routes can only be accessed by a logged-in admin

// @route   GET /users/approve/:id
// @desc    Admin action to approve a user
router.get('/approve/:id', isAuthenticated, usersController.approveUser);

// @route   GET /users/decline/:id (NEW)
// @desc    Admin action to decline/delete a user request
router.get('/decline/:id', isAuthenticated, usersController.declineUser);

// @route   GET /users/manage (NEW)
// @desc    Show the page to manage all existing users
router.get('/manage', isAuthenticated, usersController.getManageUsersPage);

// @route   GET /users/toggle/:id (NEW)
// @desc    Admin action to revoke or re-grant user permission
router.get('/toggle/:id', isAuthenticated, usersController.toggleUserApproval);

// @route   GET /users/profile (NEW)
// @desc    Show the profile page for the logged-in user to change their own password
router.get('/profile', isAuthenticated, usersController.getProfilePage);

// @route   POST /users/profile (NEW)
// @desc    Handle the password change form submission
router.post('/profile', isAuthenticated, usersController.updatePassword);


module.exports = router;