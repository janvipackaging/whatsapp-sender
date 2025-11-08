const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User'); // Import your User model

module.exports = function(passport) {
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // 1. Find the user in the database by their username
        const user = await User.findOne({ username: username });
        if (!user) {
          // User not found
          return done(null, false, { message: 'That username is not registered' });
        }

        // 2. Check the user's approval status
        if (!user.isApproved) { // <-- NEW APPROVAL CHECK
            return done(null, false, { message: 'Your account is still pending Admin approval.' });
        }

        // 3. If user is approved, check their password
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
          // Success! User is approved and password is correct.
          return done(null, user);
        } else {
          // Password incorrect
          return done(null, false, { message: 'Password incorrect' });
        }
      } catch (err) {
        console.error(err);
        return done(err);
      }
    })
  );

  // These two functions are required by Passport
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};