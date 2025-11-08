const Message = require('../models/Message');

// @desc    Show the main inbox page
exports.getInboxPage = async (req, res) => {
  try {
    // 1. Find all 'inbound' messages
    // 2. Populate 'company' and 'contact'
    // 3. Sort by 'createdAt: -1' (newest first)
    const messages = await Message.find({ direction: 'inbound' })
      .populate('company', 'name')
      .populate('contact', 'name phone') 
      .sort({ createdAt: -1 });

    // 3. Render the view and pass the messages + flash messages
    res.render('inbox', {
      messages: messages,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
    
  } catch (error) {
    console.error('Error fetching inbox page:', error);
    res.status(500).send('Error loading page');
  }
};

// ---
// --- NEW FUNCTION 1 ---
// ---
// @desc    Mark a *single* message as read
exports.markAsRead = async (req, res) => {
  try {
    const messageId = req.params.id;
    
    // Find the message by its ID and update the 'isRead' field to true
    await Message.findByIdAndUpdate(messageId, { isRead: true });
    
    req.flash('success_msg', 'Message marked as read.');
    res.redirect('/inbox'); // Redirect back to the inbox
    
  } catch (error) {
    console.error('Error marking message as read:', error);
    req.flash('error_msg', 'Could not mark message as read.');
    res.redirect('/inbox');
  }
};

// ---
// --- NEW FUNCTION 2 ---
// ---
// @desc    Mark *ALL* messages as read
exports.markAllAsRead = async (req, res) => {
  try {
    // Find all inbound messages that are *not* yet read and update them
    await Message.updateMany(
      { direction: 'inbound', isRead: false },
      { $set: { isRead: true } }
    );
    
    req.flash('success_msg', 'All messages marked as read.');
    res.redirect('/inbox'); // Redirect back to the inbox
    
  } catch (error) {
    console.error('Error marking all messages as read:', error);
    req.flash('error_msg', 'Could not mark all messages as read.');
    res.redirect('/inbox');
  }
};