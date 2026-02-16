const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  segment: { type: mongoose.Schema.Types.ObjectId, ref: 'Segment', required: true },
  templateName: { type: String }, // Stores the WhatsApp code name used
  
  status: { 
    type: String, 
    enum: ['Sending', 'Completed', 'Failed'], 
    default: 'Sending' 
  },

  // Real-time Analytics Fields
  totalSent: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  readCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Campaign', CampaignSchema);