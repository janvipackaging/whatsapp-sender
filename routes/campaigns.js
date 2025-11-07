const express = require('express');
const router = express.Router();

// We will create this controller file in the next step.
const campaignsController = require('../controllers/campaignsController');

// --- Define Routes ---

// @route   GET /campaigns/
// @desc    Show the "Create New Campaign" page
router.get('/', campaignsController.getCampaignPage);

// @route   POST /campaigns/start
// @desc    Start sending a new bulk message campaign
router.post('/start', campaignsController.startCampaign);

// --- ADD THIS NEW ROUTE ---
// @route   POST /campaigns/test
// @desc    Send a single test message for a campaign
router.post('/test', campaignsController.sendTestMessage);
// --- END OF NEW ROUTE ---

module.exports = router;