const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../config/auth');

// We will create this controller file in the next step
const inboxController = require('../controllers/inboxController');

// --- Define Routes ---
// All routes in this file are protected
router.use(isAuthenticated);


// @route   GET /inbox/
// @desc    Show the main inbox page with all replies
router.get('/', inboxController.getInboxPage);

// --- ADD THIS NEW ROUTE ---
// @route   GET /inbox/readall
// @desc    Mark ALL messages as read
router.get('/readall', inboxController.markAllAsRead);

// --- ADD THIS NEW ROUTE ---
// @route   GET /inbox/read/:id
// @desc    Mark a *single* message as read
router.get('/read/:id', inboxController.markAsRead);


module.exports = router;