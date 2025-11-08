const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  company: { // <-- New: The company this user belongs to
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  isApproved: { // <-- New: The approval gate
    type: Boolean,
    default: false
  },
  role: { // Added for future scalability
    type: String,
    enum: ['admin', 'manager', 'user'],
    default: 'user'
  }
});

// This function automatically encrypts the password *before* saving a new user
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// This adds a function to our model to easily check passwords
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);