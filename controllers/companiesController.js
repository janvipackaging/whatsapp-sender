const Company = require('../models/Company');

exports.getCompaniesPage = async (req, res) => {
  try {
    const companies = await Company.find({});
    res.render('companies', { companies, user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.addCompany = async (req, res) => {
  try {
    const { name, numberId, whatsappToken } = req.body;
    await Company.create({ name, numberId, whatsappToken });
    req.flash('success_msg', 'Company added successfully');
    res.redirect('/companies');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding company');
    res.redirect('/companies');
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    await Company.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Company deleted');
    res.redirect('/companies');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting company');
    res.redirect('/companies');
  }
};