const Message = require('../models/Message');

// @desc    Show the main inbox page
exports.getInboxPage = async (req, res) => {
  try {
    // 1. Find all 'inbound' messages in the database
    // 2. Populate 'company' and 'contact' to get their names
    // 3. Sort by 'createdAt: -1' to show the newest messages first
    const messages = await Message.find({ direction: 'inbound' })
      .populate('company', 'name')
      .populate('contact', 'name phone') // Get contact's name and phone
      .sort({ createdAt: -1 });

    // 3. Render the new EJS view and pass the messages data
    res.render('inbox', {
      messages: messages
    });
    
  } catch (error) {
    console.error('Error fetching inbox page:', error);
    res.status(500).send('Error loading page');
  }
};