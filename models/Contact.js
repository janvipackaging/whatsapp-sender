const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String 
  },
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  segments: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Segment' 
  }]
});

// Your duplicate prevention index
ContactSchema.index({ phone: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Contact', ContactSchema);