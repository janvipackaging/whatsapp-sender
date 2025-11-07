const express = require('express');
const router = express.Router();

// We will create this controller file in the next step
const inboxController = require('../controllers/inboxController');

// --- Define Routes ---

// @route   GET /inbox/
// @desc    Show the main inbox page with all replies
router.get('/', inboxController.getInboxPage);

module.exports = router;