const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    // e.g., "Diwali Offer 2025" or "Welcome Campaign"
    // We will get this from the 'templateName' for now
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  segment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Segment',
    required: true
  },
  templateName: {
    type: String,
    required: true
  },
  
  // --- The New Analytics Fields ---
  status: {
    type: String,
    enum: ['Sending', 'Completed', 'Failed'],
    default: 'Sending'
  },
  totalSent: {
    type: Number,
    default: 0
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  readCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  }
  // --- End of Analytics ---
  
}, { timestamps: true }); // timestamps adds 'createdAt' and 'updatedAt'

module.exports = mongoose.model('Campaign', CampaignSchema);