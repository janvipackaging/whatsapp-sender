const express = require('express');
const router = express.Router();
const companiesController = require('../controllers/companiesController');

// Note: 'isAuthenticated' and 'isAdmin' are applied in index.js

// @route   GET /companies
// @desc    Show Manage Companies page
router.get('/', companiesController.getCompaniesPage);

// @route   POST /companies/add
// @desc    Add a new company
router.post('/add', companiesController.addCompany);

// @route   POST /companies/delete/:id
// @desc    Delete a company (Changed to POST)
router.post('/delete/:id', companiesController.deleteCompany);

module.exports = router;