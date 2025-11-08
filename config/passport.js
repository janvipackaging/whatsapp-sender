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

        // 2. Check the user's approval status
        if (!user.isApproved) {
            return done(null, false, { message: 'Your account is still pending Admin approval.' });
        }

        // 3. Check password
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
          return done(null, user);
        } else {
          return done(null, false, { message: 'Password incorrect' });
        }
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
      const user = await User.findById(id).lean(); // <-- ADDED .lean() for speed and reliability
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};