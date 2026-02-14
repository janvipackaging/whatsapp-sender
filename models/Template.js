const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  // Standard fields
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  
  // New fields for the "Smart Fix" & UI
  displayName: { type: String }, // For UI display
  codeName: { type: String },    // For exact WhatsApp mapping
  variable1: { type: String, default: '' }, // The critical single-variable field
  
  // Array for potential future multi-variable support
  variables: [{
    name: String,
    type: { type: String, default: 'body' }
  }],
  
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique template names per company to prevent duplicates
TemplateSchema.index({ company: 1, templateName: 1 }, { unique: true });

module.exports = mongoose.model('Template', TemplateSchema);