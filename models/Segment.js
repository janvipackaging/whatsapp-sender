const mongoose = require('mongoose');

const SegmentSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', // This links the segment to a Company
    required: true 
  }
});

module.exports = mongoose.model('Segment', SegmentSchema);