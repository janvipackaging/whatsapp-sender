const express = require('express');
const router = express.Router();
const templatesController = require('../controllers/templatesController');

// Note: 'isAuthenticated' middleware is already applied in index.js for all '/templates' routes.

// @route   GET /templates
// @desc    Show the main template management page
router.get('/', templatesController.getTemplatesPage);

// @route   POST /templates/add
// @desc    Add a new template
router.post('/add', templatesController.addTemplate);

// @route   POST /templates/delete/:id
// @desc    Delete a template (Changed from GET to POST to match the UI form)
router.post('/delete/:id', templatesController.deleteTemplate);

module.exports = router;