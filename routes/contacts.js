const express = require('express');
const router = express.Router();
const multer = require('multer');
const contactsController = require('../controllers/contactsController');

// --- Multer Setup ---
const upload = multer({ dest: '/tmp/' });

// --- Define Routes ---

// @route   GET /contacts/
// @desc    Show the main contacts page
router.get('/', contactsController.getContactsPage);

// @route   POST /contacts/import
// @desc    Handle the CSV file upload
router.post('/import', upload.single('csvFile'), contactsController.importContacts);

// @route   POST /contacts/add
// @desc    Handle adding a single contact
router.post('/add', contactsController.addSingleContact);

// --- ADD THIS NEW ROUTE ---
// @route   GET /contacts/export
// @desc    Handle downloading a CSV file of contacts
router.get('/export', contactsController.exportContacts);
// --- END OF NEW ROUTE ---

module.exports = router;