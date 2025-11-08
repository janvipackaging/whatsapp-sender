const Message = require('../models/Message');

// @desc    Show the main inbox page
exports.getInboxPage = async (req, res) => {
  try {
    const messages = await Message.find({ direction: 'inbound' })
      .populate('company', 'name')
      .populate('contact', 'name phone') 
      .sort({ createdAt: -1 });

    res.render('inbox', {
      messages: messages,
      success_msg: req.flash('success_msg'), // Pass flash message
      error_msg: req.flash('error_msg')     // Pass flash message
    });
    
  } catch (error) {
    console.error('Error fetching inbox page:', error);
    res.status(500).send('Error loading page');
  }
};


// --- NEW FUNCTION ---
// @desc    Mark a specific message as read
exports.markAsRead = async (req, res) => {
    try {
        const messageId = req.params.id;
        
        // Find the message and update isRead to true
        await Message.findByIdAndUpdate(messageId, { isRead: true });
        
        req.flash('success_msg', 'Message marked as read.');
        res.redirect('/inbox'); // Go back to the inbox page
    } catch (error) {
        console.error('Error marking message as read:', error);
        req.flash('error_msg', 'Could not mark message as read.');
        res.redirect('/inbox');
    }
};