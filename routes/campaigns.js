const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController');
const { isAuthenticated } = require('../config/auth'); // <-- CRITICAL IMPORT FOR HANDLERS

// --- Define Routes ---

// @route   GET /campaigns/
router.get('/', campaignsController.getCampaignPage);

// @route   POST /campaigns/start
// NOTE: We apply isAuthenticated here as well for stability, even though index.js applies it.
router.post('/start', isAuthenticated, campaignsController.startCampaign); 

// @route   POST /campaigns/test
router.post('/test', isAuthenticated, campaignsController.sendTestMessage);

module.exports = router;