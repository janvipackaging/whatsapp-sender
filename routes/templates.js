const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../config/auth');
const templatesController = require('../controllers/templatesController');

// All routes are protected
router.use(isAuthenticated);

// @route   GET /templates/
// @desc    Show the main template management page
router.get('/', templatesController.getTemplatesPage);

// @route   POST /templates/add
// @desc    Handle the form submission to add a new template
router.post('/add', templatesController.addTemplate);

// --- ADD THIS NEW ROUTE ---
// @route   GET /templates/delete/:id
// @desc    Handle deleting a template
router.get('/delete/:id', templatesController.deleteTemplate);
// --- END OF NEW ROUTE ---

module.exports = router;