const Campaign = require('../models/Campaign');

// @desc    Show the main analytics dashboard page
exports.getReportsPage = async (req, res) => {
  try {
    // 1. Find all campaigns in the database
    // 2. Populate 'company' and 'segment' to get their names
    // 3. Sort by 'createdAt: -1' to show the newest campaigns first
    const campaigns = await Campaign.find()
      .populate('company', 'name')
      .populate('segment', 'name')
      .sort({ createdAt: -1 });

    // 3. Render the new EJS view and pass the campaign data
    res.render('reports', {
      campaigns: campaigns
    });
    
  } catch (error) {
    console.error('Error fetching reports page:', error);
    res.status(500).send('Error loading page');
  }
};