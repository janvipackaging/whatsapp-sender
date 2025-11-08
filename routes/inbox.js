const express = require('express');
const router = express.Router();
const inboxController = require('../controllers/inboxController');

// --- Define Routes ---

// @route   GET /inbox/
// @desc    Show the main inbox page with all replies
router.get('/', inboxController.getInboxPage);

// --- ADD THIS NEW ROUTE ---
// @route   GET /inbox/read/:id
// @desc    Mark a specific message as read
router.get('/read/:id', inboxController.markAsRead);
// --- END OF NEW ROUTE ---

module.exports = router;