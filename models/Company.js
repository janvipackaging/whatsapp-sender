const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  whatsappToken: { 
    type: String, 
    required: true // The permanent access token
  },
  numberId: { 
    type: String, 
    required: true // The WhatsApp Number ID
  }
});

module.exports = mongoose.model('Company', CompanySchema);