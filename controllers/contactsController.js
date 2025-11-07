const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const { Parser } = require('json2csv'); // <-- 1. NEW IMPORT
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');

// @desc    Show the main contacts page
exports.getContactsPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();

    res.render('contacts', {
      companies: companies,
      segments: segments,
      success_msg: null,
      error_msg: null
    });
  } catch (error) {
    res.status(500).send('Error loading page');
  }
};

// @desc    Handle the CSV file upload
exports.importContacts = async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const { companyId, segmentId } = req.body;
  if (!companyId || !segmentId) {
    return res.status(400).send('Company ID and Segment ID are required.');
  }

  const contactsToImport = [];
  const filePath = req.file.path; 

  fs.createReadStream(filePath)
    .pipe(csv.parse({ headers: true }))
    .on('error', (error) => {
      console.error(error);
      fs.unlinkSync(filePath);
      return res.status(500).send('Error parsing CSV file.');
    })
    .on('data', (row) => {
      if (row.phone) {
        contactsToImport.push({
          phone: row.phone,
          name: row.name || '',
          company: companyId,
          segments: [segmentId]
        });
      }
    })
    .on('end', async (rowCount) => {
      console.log(`Parsed ${rowCount} rows from CSV.`);
      fs.unlinkSync(filePath); 

      try {
        const result = await Contact.insertMany(contactsToImport, { ordered: false });
        res.send(`<h2>Import Complete!</h2>
                  <p>Successfully imported ${result.length} new contacts.</p>
                  <a href="/contacts">Import More</a>`);
                  
      } catch (error) {
        if (error.code === 11000) {
          res.send(`<h2>Import Finished</h2>
                    <p>Successfully imported ${error.result.nInserted} new contacts.</p>
                    <p>Duplicates were automatically skipped.</p>
                    <a href="/contacts">Import More</a>`);
        } else {
          console.error(error);
          res.status(500).send('An error occurred during the database import.');
        }
      }
    });
};

// @desc    Handle adding a single contact
exports.addSingleContact = async (req, res) => {
  try {
    const { name, phone, companyId, segmentId } = req.body;
    if (!phone || !companyId || !segmentId) {
      return res.status(400).send('Phone, Company, and Segment are required.');
    }

    const newContact = new Contact({
      name: name || '',
      phone: phone,
      company: companyId,
      segments: [segmentId]
    });
    
    await newContact.save();
    res.redirect('/contacts');

  } catch (error) {
    console.error('Error adding single contact:', error);
    if (error.code === 11000) {
      return res.status(400).send('Error: A contact with this phone number already exists for this company.');
    }
    res.status(500).send('Error adding contact');
  }
};


// ---
// --- THIS IS THE NEW FUNCTION ---
// ---
// @desc    Export contacts as a CSV file
exports.exportContacts = async (req, res) => {
  try {
    // 1. Get the company and segment from the URL query
    const { companyId, segmentId } = req.query;

    if (!companyId || !segmentId) {
      return res.status(400).send('Company ID and Segment ID are required for export.');
    }

    // 2. Find all contacts that match
    const contacts = await Contact.find({
      company: companyId,
      segments: segmentId
    }).lean(); // .lean() makes it faster and gives us simple JSON

    // 3. Define the columns for our CSV file
    const fields = ['phone', 'name'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(contacts);

    // 4. Set the headers to tell the browser to download the file
    res.header('Content-Type', 'text/csv');
    res.attachment('contacts_export.csv'); // This sets the file name
    
    // 5. Send the CSV data
    res.send(csv);

  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).send('Error exporting contacts');
  }
};