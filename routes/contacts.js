const express = require('express');
const router = express.Router();
const multer = require('multer');

// We will create this controller file in the next step.
// This file will hold all the *logic* for our routes.
const contactsController = require('../controllers/contactsController');

// --- Multer Setup ---
// This tells multer to save uploaded files (like our CSV)
// into a temporary folder named 'uploads/'.
// We must create this folder.
const upload = multer({ dest: 'uploads/' });

// --- Define Routes ---

// @route   GET /contacts/
// @desc    Show the main contacts page (with the import form)
// @access  Public (for now)
router.get('/', contactsController.getContactsPage);

// @route   POST /contacts/import
// @desc    Handle the CSV file upload
// @access  Public (for now)
//
// This route is special:
// It uses 'upload.single('csvFile')' as middleware.
// 'csvFile' MUST match the 'name' attribute of your <input type="file">
// Multer will catch the file, save it to 'uploads/', 
// and add its details to the 'req.file' object.
router.post('/import', upload.single('csvFile'), contactsController.importContacts);

// We will add the "Export" route later
// router.get('/export', contactsController.exportContacts);

module.exports = router;