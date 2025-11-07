const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Import your User model

module.exports = function(passport) {
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // 1. Find the user in the database by their username
        const user = await User.findOne({ username: username });
        if (!user) {
          // If no user is found, return an error message
          return done(null, false, { message: 'That username is not registered' });
        }

        // 2. If user is found, check their password
        const isMatch = await user.matchPassword(password);
        if (isMatch) {
          // If password is correct, return the user
          return done(null, user);
        } else {
          // If password is incorrect, return an error message
          return done(null, false, { message: 'Password incorrect' });
        }
      } catch (err) {
        console.error(err);
        return done(err);
      }
    })
  );

  // These two functions are required by Passport
  // They save the user's ID to the session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // They get the user's ID from the session to log them in
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};