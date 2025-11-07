const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

// @route   POST /api/send-message
// @desc    This is the webhook URL that QStash will call for each job.
// @access  Protected (QStash will send a token, but we'll add that later)
router.post('/send-message', apiController.sendMessage);

module.exports = router;