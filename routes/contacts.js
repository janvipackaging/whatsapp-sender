const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAuthenticated } = require('../config/auth');
const contactsController = require('../controllers/contactsController');

// --- Multer Setup ---
// Vercel-safe '/tmp/' folder
const upload = multer({ dest: '/tmp/' });

// --- All Contact Routes ---
// Note: 'isAuthenticated' is already applied in index.js for '/contacts'

// @route   GET /
// @desc    Show the main contacts "Master List" page (with search)
router.get('/', contactsController.getContactsPage);

// @route   POST /import
// @desc    Handle the CSV file upload
router.post('/import', upload.single('csvFile'), contactsController.importContacts);

// @route   POST /add
// @desc    Handle adding a single contact
router.post('/add', contactsController.addSingleContact);

// @route   GET /export
// @desc    Handle downloading a CSV file of contacts
router.get('/export', contactsController.exportContacts);

// @route   GET /view/:id
// @desc    Show the single contact profile & activity log page
router.get('/view/:id', contactsController.getSingleContactPage);

// @route   POST /update/:id
// @desc    Handle the "Edit Contact" form submission
router.post('/update/:id', contactsController.updateContact);

// --- NEW ROUTE: CLEAN BAD CONTACTS ---
// @route   POST /clean-bad
// @desc    Delete only contacts with invalid formats (Scientific Notation/E+)
router.post('/clean-bad', contactsController.cleanBadContacts);

module.exports = router;