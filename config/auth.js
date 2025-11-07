// This is our protection middleware
module.exports = {
  // This function checks if a user is logged in
  isAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      // If they are logged in, continue to the page they requested
      return next();
    }
    
    // If they are NOT logged in:
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/users/login'); // Send them to the login page
  }
};