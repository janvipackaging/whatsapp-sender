const express = require('express');
const router = express.Router();

// We will create this controller file in the next step
const templatesController = require('../controllers/templatesController');

// --- Define Routes ---

// @route   GET /templates/
// @desc    Show the main template management page
router.get('/', templatesController.getTemplatesPage);

// @route   POST /templates/add
// @desc    Handle the form submission to add a new template
router.post('/add', templatesController.addTemplate);

module.exports = router;