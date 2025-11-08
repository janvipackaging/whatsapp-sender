const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const { Parser } = require('json2csv');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Segment = require('../models/Segment');
const Message = require('../models/Message');
const Campaign = require('../models/Campaign');
const ActivityLog = require('../models/ActivityLog'); // We will add this model next

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
// --- THIS FUNCTION IS UPDATED FOR SEARCH ---
exports.getContactsPage = async (req, res) => {
  try {
    // 1. Get query parameters for filtering
    const { companyId, segmentId, search } = req.query; // <-- NEW: Added 'search'

    // 2. Setup database query
    let query = {};
    if (companyId) {
      query.company = companyId;
    }
    if (segmentId) {
      query.segments = segmentId;
    }
    // --- NEW: SEARCH LOGIC ---
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } }, // Search by name (case-insensitive)
        { phone: { $regex: search, $options: 'i' } }, // Search by phone
        { email: { $regex: search, $options: 'i' } }  // Search by email
      ];
    }
    // --- END OF NEW LOGIC ---

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
      contacts: contacts,
      selectedCompany: companyId,
      selectedSegment: segmentId,
      searchTerm: search, // <-- NEW: Pass search term back to the view
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (error) {
    console.error("Error fetching contacts page:", error);
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
      const formattedPhone = formatPhoneNumber(row.phone);
      if (formattedPhone && row.name) {
        contactsToImport.push({
          phone: formattedPhone,
          name: row.name,
          company: companyId,
          segments: [segmentId],
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
exports.addSingleContact = async (req, res) => {
  try {
    const { 
      name, phone, companyId, segmentId, 
      email, city, productInterest, companyName, jobTitle, leadSource, leadStatus, notes 
    } = req.body;
    
    if (!name || !phone || !companyId || !segmentId) {
      req.flash('error_msg', 'Name, Phone, Company, and Segment are required.');
      return res.redirect(req.headers.referer || '/'); 
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      req.flash('error_msg', 'Invalid phone number format.');
      return res.redirect(req.headers.referer || '/');
    }

    const newContact = new Contact({
      name, phone: formattedPhone, company: companyId, segments: [segmentId],
      email, city, productInterest, companyName, jobTitle, leadSource,
      leadStatus: leadStatus || 'New', notes
    });
    
    await newContact.save();
    
    // --- NEW: Log this activity ---
    const log = new ActivityLog({
      contact: newContact._id,
      user: req.user._id,
      action: `Contact created and added to segment (Segment ID: ${segmentId})`
    });
    await log.save();
    // --- END LOG ---
    
    req.flash('success_msg', 'Contact added successfully!');
    res.redirect(req.headers.referer || '/'); 

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
exports.exportContacts = async (req, res) => {
  try {
    const { companyId, segmentId, search } = req.query; // <-- NEW: Added 'search'

    let query = {};
    if (companyId) query.company = companyId;
    if (segmentId) query.segments = segmentId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const contacts = await Contact.find(query).lean(); 

    if (contacts.length === 0) {
      req.flash('error_msg', 'No contacts found in that selection to export.');
      return res.redirect('/contacts');
    }

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
// --- UPDATED FUNCTION 1: Get Single Contact Page ---
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

    // --- Build Full Activity Log ---
    let logEntries = [];

    // 1. Get all messages (inbound and outbound)
    const messages = await Message.find({ contact: contactId })
      .populate('campaign', 'name') // <-- NEW: Populate the campaign name
      .sort({ createdAt: 'asc' }); // Sort oldest to newest

    messages.forEach(msg => {
      let body = '';
      if (msg.direction === 'inbound') {
        body = `Customer Replied: "${msg.body}"`;
      } else {
        body = `Sent Campaign: "${msg.campaign ? msg.campaign.name : 'Unknown'}" (Status: ${msg.status})`;
      }
      logEntries.push({
        date: msg.createdAt,
        body: body
      });
    });

    // 2. Get all other activity logs
    const activities = await ActivityLog.find({ contact: contactId })
      .populate('user', 'username') // Get the admin's name
      .sort({ createdAt: 'asc' });

    activities.forEach(act => {
      logEntries.push({
        date: act.createdAt,
        body: `${act.action} by ${act.user ? act.user.username : 'system'}`
      });
    });
    
    // 3. Add the "Contact Created" event
    logEntries.push({
      date: contact.createdAt,
      body: `Contact Created and added to segment(s): ${contact.segments.map(s => s.name).join(', ')}`
    });

    // 4. Sort all activities by date, newest first
    logEntries.sort((a, b) => b.date - a.date);
    // --- End Activity Log ---
    
    res.render('contact-details', {
      contact: contact,
      activityLog: logEntries, // Pass the combined log
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });

  } catch (error) {
    console.error('Error fetching contact details:', error);
    res.status(500).send('Error loading page');
  }
};

// ---
// --- UPDATED FUNCTION 2: Update Contact Details ---
// ---
// @desc    Handle the "Edit Contact" form submission
exports.updateContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const updateData = req.body; // All data from the form
    
    if (!updateData.name || !updateData.phone) {
      req.flash('error_msg', 'Name and Phone are required.');
      return res.redirect(`/contacts/view/${contactId}`);
    }
    
    // Auto-fix phone
    updateData.phone = formatPhoneNumber(updateData.phone);

    // --- NEW: Log this activity ---
    const oldContact = await Contact.findById(contactId).lean();
    if (oldContact.leadStatus !== updateData.leadStatus) {
      const log = new ActivityLog({
        contact: contactId,
        user: req.user._id,
        action: `Lead Status changed from '${oldContact.leadStatus}' to '${updateData.leadStatus}'`
      });
      await log.save();
    }
    // --- END LOG ---

    // Find the contact and update it
    await Contact.findByIdAndUpdate(contactId, updateData);

    req.flash('success_msg', 'Contact updated successfully.');
    res.redirect(`/contacts/view/${contactId}`);

  } catch (error) {
    console.error('Error updating contact:', error);
    req.flash('error_msg', 'Error updating contact. Phone number might already exist.');
    res.redirect(`/contacts/view/${req.params.id}`);
  }
};