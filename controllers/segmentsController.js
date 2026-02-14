const Segment = require('../models/Segment');
const Company = require('../models/Company');

exports.getSegmentsPage = async (req, res) => {
  try {
    // Show only user's company segments unless admin
    const query = req.user.role === 'admin' ? {} : { company: req.user.company };
    const segments = await Segment.find(query).populate('company');
    const companies = await Company.find({}); // For dropdown
    
    res.render('segments', { segments, companies, user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.addSegment = async (req, res) => {
  try {
    const { name, companyId } = req.body;
    await Segment.create({ name, company: companyId });
    req.flash('success_msg', 'Segment created');
    res.redirect('/segments');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error creating segment');
    res.redirect('/segments');
  }
};

exports.deleteSegment = async (req, res) => {
  try {
    await Segment.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Segment deleted');
    res.redirect('/segments');
  } catch (err) {
    console.error(err);
    res.redirect('/segments');
  }
};