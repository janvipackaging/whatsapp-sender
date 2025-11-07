const express = require('express');
const router = express.Router();
const multer = require('multer');

// We will create this controller file in the next step.
// This file will hold all the *logic* for our routes.
const contactsController = require('../controllers/contactsController');

// --- Multer Setup ---
//
// --- THIS IS THE FIX ---
// We change the destination from 'uploads/' to '/tmp/'
// '/tmp/' is the *only* writable directory on Vercel.
//
const upload = multer({ dest: '/tmp/' });

// --- Define Routes ---

// @route   GET /contacts/
// @desc    Show the main contacts page (with the import form)
// @access  Public (for now)
router.get('/', contactsController.getContactsPage);

// @route   POST /contacts/import
// @desc    Handle the CSV file upload
// @access  Public (for now)
router.post('/import', upload.single('csvFile'), contactsController.importContacts);


module.exports = router;