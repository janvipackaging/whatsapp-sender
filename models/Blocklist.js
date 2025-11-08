const mongoose = require('mongoose');

const BlocklistSchema = new mongoose.Schema({
  phone: {
    type: String, // The number to block (must include + sign)
    required: true,
  },
  reason: {
    type: String, // Why the number was blocked (e.g., "Opt-Out")
    default: 'Manual Block'
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true, // Multi-tenancy: block only for this company
  },
}, { timestamps: true });

// This ensures a number can only be blocked once per company
BlocklistSchema.index({ phone: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Blocklist', BlocklistSchema);