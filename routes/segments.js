const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../config/auth');
const segmentsController = require('../controllers/segmentsController');

// All routes in this file are protected
router.use(isAuthenticated);

// @route   GET /segments/
// @desc    Show the main segment management page
router.get('/', segmentsController.getSegmentsPage);

// @route   POST /segments/add
// @desc    Handle adding a new segment
router.post('/add', segmentsController.addSegment);

// @route   GET /segments/delete/:id
// @desc    Handle deleting a segment
router.get('/delete/:id', segmentsController.deleteSegment);

module.exports = router;