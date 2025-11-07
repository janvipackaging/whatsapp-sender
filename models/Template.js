const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  name: {
    type: String, // The name you see, e.g., "Welcome Message"
    required: true
  },
  templateName: {
    type: String, // The *exact* name from WhatsApp, e.g., "welcome_v2"
    required: true,
    unique: true // You can't have two templates with the same WhatsApp name
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  // This is the "smart" part for later
  // We'll store the variables the template needs
  variables: [
    {
      name: String, // e.g., "customer_name"
      type: { type: String, default: 'body' } // e.g., 'body' or 'header'
    }
  ]
  
}, { timestamps: true });

module.exports = mongoose.model('Template', TemplateSchema);