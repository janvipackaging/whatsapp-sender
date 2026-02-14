const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// NOTE: We do NOT use 'isAuthenticated' here. 
// This route must be PUBLIC so QStash can reach it.
router.post('/send-message', apiController.sendMessageWorker);

// Webhook routes for Meta
router.get('/webhook', apiController.verifyWebhook);
router.post('/webhook', apiController.handleWebhook);

module.exports = router;