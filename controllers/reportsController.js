const Campaign = require('../models/Campaign');
const Message = require('../models/Message');

// @desc    Show all campaign reports
exports.getReportsPage = async (req, res) => {
  try {
    // Show only user's company campaigns unless admin
    const query = req.user.role === 'admin' ? {} : { company: req.user.company };
    
    const campaigns = await Campaign.find(query)
      .populate('company', 'name')
      .populate('segment', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.render('reports', {
      user: req.user,
      campaigns,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).send('Server Error');
  }
};

// @desc    Delete a campaign and its associated message logs
exports.deleteCampaign = async (req, res) => {
  try {
    const campaignId = req.params.id;

    // 1. Delete all messages associated with this campaign
    await Message.deleteMany({ campaign: campaignId });

    // 2. Delete the campaign record itself
    await Campaign.findByIdAndDelete(campaignId);

    req.flash('success_msg', 'Campaign report and associated logs deleted successfully.');
    res.redirect('/reports');
    
  } catch (err) {
    console.error('Error deleting campaign:', err);
    req.flash('error_msg', 'Error deleting campaign report.');
    res.redirect('/reports');
  }
};