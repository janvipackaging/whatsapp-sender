const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');

exports.getContactsPage = async (req, res) => {
  try {
    const companies = await Company.find();
    const segments = await Segment.find();

    res.render('contacts', {
      companies: companies,
      segments: segments
    });
  } catch (error) {
    res.status(500).send('Error loading page');
  }
};

exports.importContacts = async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const { companyId, segmentId } = req.body;

  if (!companyId || !segmentId) {
    return res.status(400).send('Company ID and Segment ID are required.');
  }

  const contactsToImport = [];
  const filePath = req.file.path; // Correct path for Vercel /tmp/

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
        
        // --- FIX 1: USE BACKTICKS ---
        res.send(`<h2>Import Complete!</h2>
                  <p>Successfully imported ${result.length} new contacts.</p>
                  <a href="/contacts">Import More</a>`);
                  
      } catch (error) {
        if (error.code === 11000) {
          // --- FIX 2: USE BACKTICKS ---
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