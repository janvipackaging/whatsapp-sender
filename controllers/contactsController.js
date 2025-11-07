const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const { Parser } = require('json2csv');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');

// --- Helper Function: Auto-fixes phone numbers ---
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove any spaces or dashes
  let cleaned = phone.replace(/[\s-]+/g, '');
  
  // Check if it already starts with '+'
  if (cleaned.startsWith('+')) {
    return cleaned; // It's already correct
  }
  
  // If not, add '+'
  return `+${cleaned}`;
}
// --- End of Helper Function ---


// @desc    Show the main contacts page
exports.getContactsPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();

    // Pass the flash messages to the view
    res.render('contacts', {
      companies: companies,
      segments: segments,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    res.status(500).send('Error loading page');
  }
};

// @desc    Handle the CSV file upload
exports.importContacts = async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'No file was uploaded. Please try again.');
    return res.redirect('/contacts');
  }
  const { companyId, segmentId } = req.body;
  if (!companyId || !segmentId) {
    req.flash('error_msg', 'Company and Segment must be selected.');
    return res.redirect('/contacts');
  }

  const contactsToImport = [];
  const filePath = req.file.path; 

  fs.createReadStream(filePath)
    .pipe(csv.parse({ headers: true }))
    .on('error', (error) => {
      console.error(error);
      fs.unlinkSync(filePath);
      req.flash('error_msg', 'Error parsing CSV file.');
      return res.redirect('/contacts');
    })
    .on('data', (row) => {
      const formattedPhone = formatPhoneNumber(row.phone); // --- USE THE AUTO-FIX ---
      if (formattedPhone) { // Only add if the phone number is valid
        contactsToImport.push({
          phone: formattedPhone,
          name: row.name || '',
          company: companyId,
          segments: [segmentId]
        });
      }
    })
    .on('end', async (rowCount) => {
      console.log(`Parsed ${rowCount} rows from CSV.`);
      fs.unlinkSync(filePath); 

      if (contactsToImport.length === 0) {
        req.flash('error_msg', 'No valid contacts were found in the file.');
        return res.redirect('/contacts');
      }

      try {
        const result = await Contact.insertMany(contactsToImport, { ordered: false });
        req.flash('success_msg', `Import complete! ${result.length} new contacts were added.`);
        res.redirect('/contacts');
                  
      } catch (error) {
        if (error.code === 11000) {
          // This error is expected for duplicates
          req.flash('success_msg', `Import finished. ${error.result.nInserted} new contacts were added. Duplicates were skipped.`);
          res.redirect('/contacts');
        } else {
          console.error(error);
          req.flash('error_msg', 'An error occurred during database import.');
          res.redirect('/contacts');
        }
      }
    });
};

// @desc    Handle adding a single contact
exports.addSingleContact = async (req, res) => {
  try {
    const { name, phone, companyId, segmentId } = req.body;
    if (!phone || !companyId || !segmentId) {
      req.flash('error_msg', 'Phone, Company, and Segment are required.');
      return res.redirect('/'); // Redirect to dashboard
    }

    const formattedPhone = formatPhoneNumber(phone); // --- USE THE AUTO-FIX ---
    if (!formattedPhone) {
      req.flash('error_msg', 'Invalid phone number format.');
      return res.redirect('/');
    }

    const newContact = new Contact({
      name: name || '',
      phone: formattedPhone,
      company: companyId,
      segments: [segmentId]
    });
    
    await newContact.save();
    
    // --- SET SUCCESS FLASH MESSAGE ---
    req.flash('success_msg', 'Contact added successfully!');
    res.redirect('/'); // Redirect to dashboard

  } catch (error) {
    console.error('Error adding single contact:', error);
    if (error.code === 11000) {
      req.flash('error_msg', 'Error: A contact with this phone number already exists for this company.');
      return res.redirect('/');
    }
    req.flash('error_msg', 'An error occurred while adding the contact.');
    res.redirect('/');
  }
};

// @desc    Export contacts as a CSV file
exports.exportContacts = async (req, res) => {
  try {
    const { companyId, segmentId } = req.query;

    if (!companyId || !segmentId) {
      req.flash('error_msg', 'Company and Segment must be selected for export.');
      return res.redirect('/contacts');
    }

    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    }).lean(); 

    if (contacts.length === 0) {
      req.flash('error_msg', 'No contacts found in that segment to export.');
      return res.redirect('/contacts');
    }

    const fields = ['phone', 'name'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(contacts);

    res.header('Content-Type', 'text/csv');
    res.attachment('contacts_export.csv'); 
    
    res.send(csv);

  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).send('Error exporting contacts');
  }
};