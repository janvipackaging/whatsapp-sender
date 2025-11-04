const express = require('express');
const router = express.Router();

// We will create this controller file in the next step.
const campaignsController = require('../controllers/campaignsController');

// --- Define Routes ---

// @route   GET /campaigns/
// @desc    Show the "Create New Campaign" page
// @access  Public (for now)
router.get('/', campaignsController.getCampaignPage);

// @route   POST /campaigns/start
// @desc    Start sending a new bulk message campaign
// @access  Public (for now)
router.post('/start', campaignsController.startCampaign);

module.exports = router;