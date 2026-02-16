const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Optimized Database Connection Logic
 * Specifically tuned for Vercel/Serverless environments experiencing 
 * SSL alert internal errors and connection pool clearing.
 */
const connectDB = async () => {
  try {
    const options = {
      // Limit the number of concurrent connections to prevent Atlas from being overwhelmed
      maxPoolSize: 10,
      
      // How long the driver will wait to find a server before failing
      serverSelectionTimeoutMS: 5000,
      
      // Close inactive sockets to prevent "SSL routines:ssl3_read_bytes" errors 
      // caused by dangling connections being reset by the cloud firewall
      socketTimeoutMS: 45000,
      
      // Force IPv4 as some cloud providers have intermittent SSL handshake issues with IPv6
      family: 4,
    };

    await mongoose.connect(process.env.MONGO_URI, options);
    console.log('MongoDB Connected (Optimized for High Load)...');
    
  } catch (err) {
    console.error('CRITICAL: MongoDB Connection Failed:', err.message);
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;