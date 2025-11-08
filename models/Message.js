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
  // --- NEW FIELD ---
  // This links an outbound message to the campaign it came from.
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: false // Not required, since inbound replies don't have it
  },
  
  // --- Message Details ---
  waMessageId: {
    type: String, // The 'wamid' from WhatsApp
    required: true,
    unique: true
  },
  body: {
    type: String, // The text of the customer's reply or our outbound message
    required: false // Not required for status-only messages
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  isRead: {
    type: Boolean,
    default: false // For your "Inbox" page
  }
  
}, { timestamps: true }); 

module.exports = mongoose.model('Message', MessageSchema);