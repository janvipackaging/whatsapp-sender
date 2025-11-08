const express = require('express');
const router = express.Router();
const blocklistController = require('../controllers/blocklistController');
const { isAuthenticated } = require('../config/auth');

// All routes are protected
router.use(isAuthenticated); 

// @route   GET /blocklist/
// @desc    Show the main blocklist management page
router.get('/', blocklistController.getBlocklistPage);

// @route   POST /blocklist/add
// @desc    Handle adding a new number to the blocklist
router.post('/add', blocklistController.addToBlocklist);

// @route   GET /blocklist/remove/:id
// @desc    Handle removing a number from the blocklist
router.get('/remove/:id', blocklistController.removeFromBlocklist);

module.exports = router;