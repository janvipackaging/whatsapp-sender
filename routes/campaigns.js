const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController'); // <-- Controller is correctly imported

// --- Define Routes ---

// @route   GET /campaigns/
router.get('/', campaignsController.getCampaignPage);

// @route   POST /campaigns/start
router.post('/start', campaignsController.startCampaign); // <-- Crash is happening HERE

// @route   POST /campaigns/test
router.post('/test', campaignsController.sendTestMessage);

module.exports = router;