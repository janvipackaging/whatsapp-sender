const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// The route that QStash calls to send the actual message
router.post('/send-message', apiController.sendMessageWorker);

module.exports = router;