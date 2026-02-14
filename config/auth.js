module.exports = {
  // Check if user is logged in
  isAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/users/login');
  },

  // Check if user is an Admin (New Function)
  isAdmin: function(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
      return next();
    }
    req.flash('error_msg', 'Access denied. Admins only.');
    res.redirect('/'); // Redirect to dashboard if not admin
  }
};