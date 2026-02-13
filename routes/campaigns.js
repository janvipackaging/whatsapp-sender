const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController');

// Note: 'isAuthenticated' middleware is already applied in index.js for all '/campaigns' routes.

// @route   GET /campaigns/
// @desc    Show the "Create New Campaign" page
router.get('/', campaignsController.getCampaignPage);

// @route   POST /campaigns/start
// @desc    Start sending a new bulk message campaign
router.post('/start', campaignsController.startCampaign);

// @route   POST /campaigns/test
// @desc    Send a single test message for a campaign (Uses Smart Waterfall Logic)
router.post('/test', campaignsController.sendTestMessage);

module.exports = router;