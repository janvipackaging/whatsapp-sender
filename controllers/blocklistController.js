const Blocklist = require('../models/Blocklist');
const Company = require('../models/Company');

exports.getBlocklistPage = async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { company: req.user.company };
    const blockedNumbers = await Blocklist.find(query).populate('company');
    const companies = await Company.find({});
    
    res.render('blocklist', { blockedNumbers, companies, user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.addToBlocklist = async (req, res) => {
  try {
    const { phone, companyId, reason } = req.body;
    await Blocklist.create({ phone, company: companyId, reason });
    req.flash('success_msg', 'Number blocked');
    res.redirect('/blocklist');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error blocking number');
    res.redirect('/blocklist');
  }
};

exports.removeFromBlocklist = async (req, res) => {
  try {
    await Blocklist.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Number unblocked');
    res.redirect('/blocklist');
  } catch (err) {
    console.error(err);
    res.redirect('/blocklist');
  }
};  