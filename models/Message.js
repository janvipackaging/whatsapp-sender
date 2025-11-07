const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  
  // --- Message Details ---
  waMessageId: {
    type: String, // The 'wamid' from WhatsApp
    required: true,
    unique: true
  },
  body: {
    type: String, // The text of the customer's reply
    required: true
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'], // We'll only store 'inbound' for now
    default: 'inbound'
  },
  isRead: {
    type: Boolean,
    default: false // For your "Inbox" page, to mark messages as read
  }
  
}, { timestamps: true }); // 'createdAt' will be when the message was received

module.exports = mongoose.model('Message', MessageSchema);