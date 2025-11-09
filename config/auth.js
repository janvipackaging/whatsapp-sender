module.exports = {
  // This function checks if a user is logged in
  isAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      // If they are logged in, continue
      return next();
    }
    
    // If they are NOT logged in:
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/users/login'); // Send them to the login page
  },
  
  // --- THIS IS THE NEW FUNCTION ---
  // This function checks if the logged-in user is an Admin
  isAdmin: function(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
      // If they are an admin, continue
      return next();
    }
    
    // If they are a normal user:
    req.flash('error_msg', 'You do not have permission to view that page.');
    res.redirect('/'); // Send them back to the dashboard
  }
};