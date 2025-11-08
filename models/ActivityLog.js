const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true
    // e.g., "Lead Status changed from 'New' to 'Qualified'"
  }
}, { timestamps: true }); // 'createdAt' is the date of the activity

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);