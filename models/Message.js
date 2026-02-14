const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },
  // WhatsApp Message ID (Critical for tracking delivery/read receipts)
  waMessageId: {
    type: String,
    unique: true,
    sparse: true
  },
  body: {
    type: String,
    required: true
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
  // For the Inbox Unread badge
  isRead: {
    type: Boolean,
    default: false
  },
  error: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', MessageSchema);