const express = require('express');
const router = express.Router();
const segmentsController = require('../controllers/segmentsController');

// Note: 'isAuthenticated' is applied in index.js

// @route   GET /segments
// @desc    Show Manage Segments page
router.get('/', segmentsController.getSegmentsPage);

// @route   POST /segments/add
// @desc    Add a new segment
router.post('/add', segmentsController.addSegment);

// @route   POST /segments/delete/:id
// @desc    Delete a segment (Changed to POST)
router.post('/delete/:id', segmentsController.deleteSegment);

module.exports = router;