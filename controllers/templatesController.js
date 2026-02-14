const Template = require('../models/Template');
const Company = require('../models/Company');

// @desc    Show the main template management page
exports.getTemplatesPage = async (req, res) => {
  try {
    // 1. Get all companies (for the dropdown)
    // Only show companies the user has access to
    const companyQuery = req.user.role === 'admin' ? {} : { _id: req.user.company };
    const companies = await Company.find(companyQuery);
    
    // 2. Get all existing templates for the user's company/companies
    const templates = await Template.find(companyQuery).populate('company', 'name');

    // 3. Render the view
    // NOTE: We do NOT call req.flash() here because the global middleware in index.js handles it.
    res.render('templates', {
      companies: companies,
      templates: templates,
      user: req.user
    });
    
  } catch (error) {
    console.error('Error fetching templates page:', error);
    res.status(500).send('Error loading page');
  }
};


// @desc    Handle the form submission to add a new template
exports.addTemplate = async (req, res) => {
  try {
    // 1. Get the data from the form (MATCHING THE EJS FILE EXACTLY)
    const { displayName, codeName, companyId, variable1 } = req.body;

    if (!displayName || !codeName || !companyId) {
        req.flash('error_msg', 'Display Name, WhatsApp Code Name, and Company are required.');
        return res.redirect('/templates');
    }

    // 2. Prepare the variables array (Backwards compatibility)
    let variables = [];
    if (variable1) {
      variables.push({ name: variable1, type: 'body' });
    }

    // 3. Create the new template object
    // We save to MULTIPLE fields to ensure compatibility with all controllers
    const newTemplate = new Template({
      name: displayName,           // Fallback
      displayName: displayName,    // Primary
      templateName: codeName,      // Fallback
      codeName: codeName,          // Primary
      company: companyId,
      variable1: variable1,        // CRITICAL: This is what campaignsController looks for
      variables: variables         // Backwards compatibility
    });

    // 4. Save it to the database
    await newTemplate.save();

    // 5. Redirect back to the templates page
    req.flash('success_msg', 'Template saved successfully.');
    res.redirect('/templates');
    
  } catch (error) {
    console.error('Error adding new template:', error);
    if (error.code === 11000) {
      req.flash('error_msg', 'Error: A template with that WhatsApp Name already exists.');
      return res.redirect('/templates');
    }
    req.flash('error_msg', 'Error adding template.');
    res.redirect('/templates');
  }
};

// @desc    Handle deleting a template
exports.deleteTemplate = async (req, res) => {
  try {
    const templateId = req.params.id;

    // Find the template by its ID and delete it
    await Template.findByIdAndDelete(templateId);

    req.flash('success_msg', 'Template deleted successfully.');
    res.redirect('/templates');
    
  } catch (error) {
    console.error('Error deleting template:', error);
    req.flash('error_msg', 'Error deleting template.');
    res.redirect('/templates');
  }
};