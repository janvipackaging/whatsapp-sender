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
    required: false // Not required, since inbound replies don't have this
  },
  // --- END OF NEW FIELD ---
  
  waMessageId: {
    type: String, // The 'wamid' from WhatsApp
    required: true,
    unique: true
  },
  body: {
    type: String, // The text of the customer's reply
    required: false // Not required for status-only or outbound template messages
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  
  // --- NEW STATUS FIELD ---
  // This will store 'sent', 'delivered', 'read' from the webhook
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  // --- END OF NEW FIELD ---

  isRead: {
    type: Boolean,
    default: false // For your "Inbox" page
  }
  
}, { timestamps: true }); // 'createdAt' will be when the message was received or sent

module.exports = mongoose.model('Message', MessageSchema);