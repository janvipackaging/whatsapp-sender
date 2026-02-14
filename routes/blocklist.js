const express = require('express');
const router = express.Router();
const blocklistController = require('../controllers/blocklistController');

// Note: 'isAuthenticated' is applied in index.js

// @route   GET /blocklist
// @desc    Show Manage Blocklist page
router.get('/', blocklistController.getBlocklistPage);

// @route   POST /blocklist/add
// @desc    Block a number
router.post('/add', blocklistController.addToBlocklist);

// @route   POST /blocklist/delete/:id
// @desc    Unblock a number (Changed to POST to match UI form)
router.post('/delete/:id', blocklistController.removeFromBlocklist);

module.exports = router;