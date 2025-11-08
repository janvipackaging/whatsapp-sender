const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User'); 

module.exports = function(passport) {
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // 1. Find the user
        const user = await User.findOne({ username: username });
        if (!user) {
          return done(null, false, { message: 'That username is not registered' });
        }

        // 2. Check password
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
          return done(null, false, { message: 'Password incorrect' });
        }

        // 3. FINAL SECURITY CHECK: Check the user's approval status
        if (!user.isApproved) { // <-- This is the core check
            return done(null, false, { message: 'Your account is still pending Admin approval.' });
        }

        // 4. Success! User is approved and password is correct.
        return done(null, user);
      } catch (err) {
        console.error(err);
        return done(err);
      }
    })
  );

  // Saves user ID to the session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // CRITICAL FIX: Ensure the user document is reloaded from the database
  passport.deserializeUser(async (id, done) => {
    try {
      // We force Mongoose to fetch the fresh user data every time the session is accessed
      // The issue is likely here: the system needs the full user object to pass the middleware check.
      const user = await User.findById(id).lean(); 
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};