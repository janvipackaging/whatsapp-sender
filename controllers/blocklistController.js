const Blocklist = require('../models/Blocklist');
const Company = require('../models/Company');

// Helper function: Auto-fixes phone numbers (same as contactsController)
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s-]+/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  return `+${cleaned}`;
}

// @desc    Show the main blocklist page
exports.getBlocklistPage = async (req, res) => {
  try {
    const companies = await Company.find();
    
    // Fetch all blocked numbers and show which company they apply to
    const blockedNumbers = await Blocklist.find()
      .populate('company', 'name')
      .sort({ createdAt: -1 });

    res.render('blocklist', {
      companies: companies,
      blockedNumbers: blockedNumbers,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
    
  } catch (error) {
    console.error('Error fetching blocklist page:', error);
    res.status(500).send('Error loading blocklist page');
  }
};

// @desc    Handle adding a number to the blocklist
exports.addToBlocklist = async (req, res) => {
  try {
    const { phone, companyId, reason } = req.body;
    
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      req.flash('error_msg', 'Invalid phone number format.');
      return res.redirect('/blocklist');
    }

    const newBlock = new Blocklist({
      phone: formattedPhone,
      company: companyId,
      reason: reason
    });
    
    await newBlock.save();
    
    req.flash('success_msg', `Number ${formattedPhone} added to blocklist.`);
    res.redirect('/blocklist');

  } catch (error) {
    console.error('Error adding to blocklist:', error);
    if (error.code === 11000) {
      req.flash('error_msg', 'Error: This number is already blocked for this company.');
      return res.redirect('/blocklist');
    }
    req.flash('error_msg', 'Could not add to blocklist.');
    res.redirect('/blocklist');
  }
};

// @desc    Handle removing a number from the blocklist
exports.removeFromBlocklist = async (req, res) => {
  try {
    const blockId = req.params.id;
    await Blocklist.findByIdAndDelete(blockId);
    
    req.flash('success_msg', 'Number successfully removed from blocklist.');
    res.redirect('/blocklist');

  } catch (error) {
    console.error('Error removing from blocklist:', error);
    req.flash('error_msg', 'Could not remove number from blocklist.');
    res.redirect('/blocklist');
  }
};