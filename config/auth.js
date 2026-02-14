module.exports = {
  // Protects standard routes
  isAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    req.flash('error_msg', 'Please log in to view that resource');
    res.redirect('/users/login');
  },

  // Protects Admin-only routes (REQUIRED for dashboard to load)
  isAdmin: function(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
      return next();
    }
    req.flash('error_msg', 'Access denied. Admins only.');
    res.redirect('/'); 
  }
};