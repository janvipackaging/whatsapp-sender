const mongoose = require('mongoose');

const BlocklistSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  // Added Reason field to match the new UI
  reason: {
    type: String,
    default: 'Manual Block'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Blocklist', BlocklistSchema);