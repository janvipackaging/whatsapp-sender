const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// --- QStash Worker Route ---
// This is the URL that QStash calls for each message
router.post('/send-message', apiController.sendMessage);


// --- WHATSAPP WEBHOOK ROUTES ---

// @route   GET /api/webhook
// @desc    This is for WhatsApp to *verify* our webhook.
router.get('/webhook', apiController.verifyWebhook);

// @route   POST /api/webhook
// @desc    This is where WhatsApp sends all data (replies, read status, etc.)
router.post('/webhook', apiController.handleWebhook);


module.exports = router;