const Company = require('../models/Company');
const User = require('../models/User'); // We need this for safe deletion

// @desc    Show the main company management page
exports.getCompaniesPage = async (req, res) => {
  try {
    // Get all existing companies
    const companies = await Company.find().sort({ name: 1 });

    res.render('companies', {
      companies: companies,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
    
  } catch (error) {
    console.error('Error fetching companies page:', error);
    res.status(500).send('Error loading page');
  }
};


// @desc    Handle adding a new company
exports.addCompany = async (req, res) => {
  try {
    const { name, numberId, whatsappToken } = req.body;

    // 1. Check if company name already exists
    const existingCompany = await Company.findOne({ name: name });
    if (existingCompany) {
      req.flash('error_msg', 'A company with this name already exists.');
      return res.redirect('/companies');
    }

    // 2. Create the new company
    const newCompany = new Company({
      name,
      numberId,
      whatsappToken
    });

    // 3. Save it to the database
    await newCompany.save();

    req.flash('success_msg', 'New company created successfully.');
    res.redirect('/companies');
    
  } catch (error)
 {
    console.error('Error adding new company:', error);
    if (error.code === 11000) {
      req.flash('error_msg', 'That Name, Number ID, or Token is already in use.');
      return res.redirect('/companies');
    }
    req.flash('error_msg', 'Error adding company.');
    res.redirect('/companies');
  }
};


// @desc    Handle deleting a company
exports.deleteCompany = async (req, res) => {
  try {
    const companyId = req.params.id;

    // 1. (Safety Check) Check if any users are assigned to this company
    const userCount = await User.countDocuments({ company: companyId });
    if (userCount > 0) {
      req.flash('error_msg', 'Cannot delete company: Users are still assigned to it. Please reassign users first.');
      return res.redirect('/companies');
    }
    
    // Add similar safety checks for Contacts, Segments, etc. if needed

    // 2. Now it's safe to delete the company
    await Company.findByIdAndDelete(companyId);

    req.flash('success_msg', 'Company deleted successfully.');
    res.redirect('/companies');
    
  } catch (error) {
    console.error('Error deleting company:', error);
    req.flash('error_msg', 'Error deleting company.');
    res.redirect('/companies');
  }
};