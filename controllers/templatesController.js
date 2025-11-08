const Template = require('../models/Template');
const Company = require('../models/Company');

// @desc    Show the main template management page
//          It will show a list of existing templates and a form to add a new one.
exports.getTemplatesPage = async (req, res) => {
  try {
    // 1. Get all companies (for the dropdown)
    const companies = await Company.find();
    
    // 2. Get all existing templates
    const templates = await Template.find().populate('company', 'name');

    // 3. Render the new EJS view
    res.render('templates', {
      companies: companies,
      templates: templates,
      success_msg: req.flash('success_msg'), // Pass flash messages
      error_msg: req.flash('error_msg')     // Pass flash messages
    });
    
  } catch (error) {
    console.error('Error fetching templates page:', error);
    res.status(500).send('Error loading page');
  }
};


// @desc    Handle the form submission to add a new template
exports.addTemplate = async (req, res) => {
  try {
    // 1. Get the data from the form
    const { name, templateName, companyId, variableName } = req.body;

    // 2. Prepare the variables array
    let variables = [];
    if (variableName) {
      variables.push({ name: variableName, type: 'body' });
    }

    // 3. Create the new template object
    const newTemplate = new Template({
      name: name,
      templateName: templateName,
      company: companyId,
      variables: variables
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

// ---
// --- THIS IS THE NEW FUNCTION ---
// ---
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