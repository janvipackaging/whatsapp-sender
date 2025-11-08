const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const { Parser } = require('json2csv');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Message = require('../models/Message'); // For Activity Log
const Campaign = require('../models/Campaign'); // For Activity Log

// --- Helper Function: Auto-fixes phone numbers ---
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s-]+/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  return `+${cleaned}`;
}

// @desc    Show the main contacts "Master List" page
// --- THIS FUNCTION IS COMPLETELY REBUILT ---
exports.getContactsPage = async (req, res) => {
  try {
    // 1. Get query parameters for filtering
    const { companyId, segmentId } = req.query;

    // 2. Setup database query
    let query = {};
    if (companyId) {
      query.company = companyId;
    }
    if (segmentId) {
      query.segments = segmentId;
    }

    // 3. Get all data for filters
    const companies = await Company.find();
    const segments = await Segment.find();
    
    // 4. Get the filtered list of contacts
    const contacts = await Contact.find(query)
      .populate('company', 'name')
      .populate('segments', 'name')
      .sort({ createdAt: -1 });

    // 5. Render the view with all data
    res.render('contacts', {
      companies: companies,
      segments: segments,
      contacts: contacts, // The list of contacts to show in the table
      // Pass the current filter selection back to the EJS
      selectedCompany: companyId,
      selectedSegment: segmentId,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error("Error fetching contacts page:", error);
    res.status(500).send('Error loading page');
  }
};

// @desc    Handle the CSV file upload
// --- THIS FUNCTION IS UPDATED ---
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
      const formattedPhone = formatPhoneNumber(row.phone);
      // CSV must have 'name' and 'phone'
      if (formattedPhone && row.name) {
        contactsToImport.push({
          phone: formattedPhone,
          name: row.name,
          company: companyId,
          segments: [segmentId],
          
          // --- NEW OPTIONAL FIELDS ---
          email: row.email || null,
          city: row.city || null,
          productInterest: row.productInterest || null,
          companyName: row.companyName || null,
          jobTitle: row.jobTitle || null,
          leadSource: row.leadSource || null,
          leadStatus: row.leadStatus || 'New',
          notes: row.notes || null
        });
      }
    })
    .on('end', async (rowCount) => {
      console.log(`Parsed ${rowCount} rows from CSV.`);
      fs.unlinkSync(filePath); 

      if (contactsToImport.length === 0) {
        req.flash('error_msg', 'No valid contacts with name and phone were found in the file.');
        return res.redirect('/contacts');
      }

      try {
        const result = await Contact.insertMany(contactsToImport, { ordered: false });
        req.flash('success_msg', `Import complete! ${result.length} new contacts were added.`);
        res.redirect('/contacts');
                  
      } catch (error) {
        if (error.code === 11000) {
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
// --- THIS FUNCTION IS UPDATED ---
exports.addSingleContact = async (req, res) => {
  try {
    // 1. Get all data from the form (including new fields)
    const { 
      name, phone, companyId, segmentId, 
      email, city, productInterest, companyName, jobTitle, leadSource, leadStatus, notes 
    } = req.body;
    
    // Mandatory fields
    if (!name || !phone || !companyId || !segmentId) {
      req.flash('error_msg', 'Name, Phone, Company, and Segment are required.');
      return res.redirect(req.headers.referer || '/'); // Redirect back to previous page
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      req.flash('error_msg', 'Invalid phone number format.');
      return res.redirect(req.headers.referer || '/');
    }

    // 2. Create and save the new contact
    const newContact = new Contact({
      name,
      phone: formattedPhone,
      company: companyId,
      segments: [segmentId],
      email,
      city,
      productInterest,
      companyName,
      jobTitle,
      leadSource,
      leadStatus: leadStatus || 'New',
      notes
    });
    
    await newContact.save();
    
    req.flash('success_msg', 'Contact added successfully!');
    res.redirect(req.headers.referer || '/'); // Redirect back to previous page

  } catch (error) {
    console.error('Error adding single contact:', error);
    if (error.code === 11000) {
      req.flash('error_msg', 'Error: A contact with this phone number already exists for this company.');
      return res.redirect(req.headers.referer || '/');
    }
    req.flash('error_msg', 'An error occurred while adding the contact.');
    res.redirect(req.headers.referer || '/');
  }
};

// @desc    Export contacts as a CSV file
// --- THIS FUNCTION IS UPDATED ---
exports.exportContacts = async (req, res) => {
  try {
    const { companyId, segmentId } = req.query;

    let query = {};
    if (companyId) query.company = companyId;
    if (segmentId) query.segments = segmentId;

    const contacts = await Contact.find(query).lean(); 

    if (contacts.length === 0) {
      req.flash('error_msg', 'No contacts found in that selection to export.');
      return res.redirect('/contacts');
    }

    // --- NEW: Export all fields ---
    const fields = [
      'name', 'phone', 'email', 'city', 'companyName', 
      'jobTitle', 'productInterest', 'leadSource', 'leadStatus', 'notes'
    ];
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

// ---
// --- NEW FUNCTION 1: Get Single Contact Page ---
// ---
// @desc    Show the profile page for a single contact
exports.getSingleContactPage = async (req, res) => {
  try {
    const contactId = req.params.id;
    const contact = await Contact.findById(contactId)
      .populate('company', 'name')
      .populate('segments', 'name');

    if (!contact) {
      req.flash('error_msg', 'Contact not found.');
      return res.redirect('/contacts');
    }

    // --- Build Activity Log ---
    // 1. Find all messages (inbound and outbound)
    const messages = await Message.find({ contact: contactId })
      .sort({ createdAt: -1 })
      .limit(20); // Get last 20 messages

    // 2. We can find campaigns later, for now just messages
    const activityLog = messages.map(msg => {
      return {
        type: msg.direction === 'inbound' ? 'Reply' : 'Message',
        body: msg.direction === 'inbound' ? msg.body : `Template: ${msg.campaign ? 'N/A' : 'N/A'}`,
        status: msg.status,
        date: msg.createdAt
      }
    });
    // --- End Activity Log ---
    
    res.render('contact-details', {
      contact: contact,
      activityLog: activityLog, // Pass the log
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error('Error fetching contact details:', error);
    res.status(500).send('Error loading page');
  }
};

// ---
// --- NEW FUNCTION 2: Update Contact Details ---
// ---
// @desc    Handle the "Edit Contact" form submission
exports.updateContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // Get all the data from the edit form
    const { 
      name, phone, email, city, productInterest, 
      companyName, jobTitle, leadSource, leadStatus, notes 
    } = req.body;

    // Validate mandatory fields
    if (!name || !phone) {
      req.flash('error_msg', 'Name and Phone are required.');
      return res.redirect(`/contacts/view/${contactId}`);
    }
    
    const formattedPhone = formatPhoneNumber(phone);

    // Find the contact and update it
    await Contact.findByIdAndUpdate(contactId, {
      name,
      phone: formattedPhone,
      email,
      city,
      productInterest,
      companyName,
      jobTitle,
      leadSource,
      leadStatus,
      notes
    });

    req.flash('success_msg', 'Contact updated successfully.');
    res.redirect(`/contacts/view/${contactId}`);

  } catch (error) {
    console.error('Error updating contact:', error);
    req.flash('error_msg', 'Error updating contact. Phone number might already exist.');
    res.redirect(`/contacts/view/${req.params.id}`);
  }
};