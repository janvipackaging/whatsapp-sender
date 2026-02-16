const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// All routes here are PUBLIC so QStash and Meta can access them
router.post('/send-message', apiController.sendMessageWorker);
router.get('/webhook', apiController.verifyWebhook);
router.post('/webhook', apiController.handleWebhook);

module.exports = router;