const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

// @route   GET /reports
// @desc    Show all reports
router.get('/', reportsController.getReportsPage);

// @route   POST /reports/delete/:id
// @desc    Delete a junk campaign report
router.post('/delete/:id', reportsController.deleteCampaign);

module.exports = router;