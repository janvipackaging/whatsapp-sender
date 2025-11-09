const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../config/auth');
const companiesController = require('../controllers/companiesController');
const { isAdmin } = require('../config/auth'); // We will create this new security check

// All routes in this file are protected and require Admin access
router.use(isAuthenticated, isAdmin);

// @route   GET /companies/
// @desc    Show the main company management page
router.get('/', companiesController.getCompaniesPage);

// @route   POST /companies/add
// @desc    Handle adding a new company
router.post('/add', companiesController.addCompany);

// @route   GET /companies/delete/:id
// @desc    Handle deleting a company
router.get('/delete/:id', companiesController.deleteCompany);

module.exports = router;