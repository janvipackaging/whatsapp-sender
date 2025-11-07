const express = require('express');
const router = express.Router();

// We will create this controller file in the next step
const reportsController = require('../controllers/reportsController');

// --- Define Routes ---

// @route   GET /reports/
// @desc    Show the main analytics dashboard page
router.get('/', reportsController.getReportsPage);

module.exports = router;