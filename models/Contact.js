const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  // --- Mandatory Fields ---
  name: {
    type: String,
    required: true,
    trim: true // Removes whitespace
  },
  phone: { 
    type: String, 
    required: true,
    trim: true
  },
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company',
    required: true 
  },
  segments: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Segment'
  }],

  // --- NEW: Optional B2B CRM Fields ---
  email: {
    type: String,
    trim: true,
    lowercase: true // Automatically converts email to lowercase
  },
  city: {
    type: String,
    trim: true
  },
  productInterest: {
    type: String,
    trim: true
  },
  companyName: { // The contact's own company, e.g., "ABC Printers Ltd."
    type: String,
    trim: true
  },
  jobTitle: { // e.g., "Purchase Manager"
    type: String,
    trim: true
  },
  leadSource: { // e.g., "IndiaMart", "Google Ads"
    type: String,
    trim: true
  },
  leadStatus: {
    type: String,
    trim: true,
    default: 'New' // Sets a default status for all new contacts
  },
  notes: {
    type: String,
    trim: true
  }
  
}, { timestamps: true }); // Adds createdAt and updatedAt

// --- This is your duplicate prevention ---
// It ensures 'phone' and 'company' (your company) are unique
ContactSchema.index({ phone: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Contact', ContactSchema);