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
    // IMPROVED: Added default empty array and index for performance
    segments: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Segment',
        index: true // Mandatory for fast campaign filtering
    }],

    // --- Optional B2B CRM Fields ---
    email: {
        type: String,
        trim: true,
        lowercase: true 
    },
    city: {
        type: String,
        trim: true
    },
    productInterest: {
        type: String,
        trim: true
    },
    companyName: { 
        type: String,
        trim: true
    },
    jobTitle: { 
        type: String,
        trim: true
    },
    leadSource: { 
        type: String,
        trim: true
    },
    leadStatus: {
        type: String,
        trim: true,
        default: 'New'
    },
    notes: {
        type: String,
        trim: true
    }
    
    }, { timestamps: true }); 

    // --- Duplicate Prevention ---
    // Ensures a phone number is unique within a single company
    ContactSchema.index({ phone: 1, company: 1 }, { unique: true });

    // --- Performance Search Index ---
    // Helps the "Search / Filter" box stay fast
    ContactSchema.index({ name: 'text', email: 'text' });

    module.exports = mongoose.model('Contact', ContactSchema);