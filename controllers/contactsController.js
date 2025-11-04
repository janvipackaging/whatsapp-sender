const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');

// @desc    Show the main contacts page (with the import form)
exports.getContactsPage = async (req, res) => {
  try {
    // In a real app, you would fetch these from the DB
    // For now, we'll send dummy data
    const dummyCompanies = [
      { _id: 'COMPANY_ID_1', name: 'Test Company 1' },
    ];
    const dummySegments = [
      { _id: 'SEGMENT_ID_1', name: 'Test Segment 1' }
    ];

    // This tells EJS to render the 'views/contacts.ejs' file
    // and passes data to it.
    res.render('contacts', {
      companies: dummyCompanies,
      segments: dummySegments
    });
  } catch (error) {
    res.status(500).send('Error loading page');
  }
};

// @desc    Handle the CSV file upload and import contacts
exports.importContacts = async (req, res) => {
  // 1. Check if a file was actually uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // 2. Get the company and segment ID from the form
  const { companyId, segmentId } = req.body;

  // Simple validation
  if (!companyId || !segmentId) {
    return res.status(400).send('Company ID and Segment ID are required.');
  }

  const contactsToImport = [];
  const filePath = path.resolve(__dirname, '..', req.file.path);

  // 3. Use fast-csv to read the uploaded file
  fs.createReadStream(filePath)
    .pipe(csv.parse({ headers: true }))
    .on('error', (error) => {
      console.error(error);
      // Clean up the temp file
      fs.unlinkSync(filePath);
      return res.status(500).send('Error parsing CSV file.');
    })
    .on('data', (row) => {
      // 4. For each row, create a contact object
      // We assume your CSV has 'phone' and 'name' columns
      // You can add more columns here
      if (row.phone) {
        contactsToImport.push({
          phone: row.phone,
          name: row.name || '', // Use empty string if name is missing
          company: companyId,
          segments: [segmentId] // Add the contact to the selected segment
        });
      }
    })
    .on('end', async (rowCount) => {
      console.log(`Parsed ${rowCount} rows from CSV.`);
      
      // 5. Clean up the temporary file
      fs.unlinkSync(filePath);

      // 6. --- THIS IS THE DUPLICATE PREVENTION ---
      // We use Contact.insertMany() with { ordered: false }
      // 'ordered: false' tells MongoDB to try and insert ALL contacts,
      // and not to stop if one fails (like a duplicate).
      // The 'unique index' we set on the Contact model
      // will automatically cause duplicates to fail, and the
      // others will be inserted successfully.
      try {
        const result = await Contact.insertMany(contactsToImport, { ordered: false });
        
        // 7. Send a success message
        res.send(`<h2>Import Complete!</h2>
                  <p>Successfully imported ${result.length} new contacts.</p>
                  <a href="/contacts">Import More</a>`);
                  
      } catch (error) {
        // 8. Handle errors (including duplicates)
        if (error.code === 11000) {
          // This "error" is expected when there are duplicates.
          // error.result.nInserted shows how many *new* contacts were added.
          res.send(`<h2>Import Finished</h2>
                    <p>Successfully imported ${error.result.nInserted} new contacts.</p>
                    <p>Duplicates were automatically skipped.</p>
                    <a href="/contacts">Import More</a>`);
        } else {
          // A different, unexpected error
          console.error(error);
          res.status(500).send('An error occurred during the database import.');
        }
      }
    });
};