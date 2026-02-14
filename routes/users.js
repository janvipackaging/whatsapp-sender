const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { isAuthenticated, isAdmin } = require('../config/auth');

// --- Public Routes ---
router.get('/login', usersController.getLoginPage);
router.post('/login', usersController.loginHandle);
router.get('/register', usersController.getRegisterPage);
router.post('/register', usersController.registerHandle);
router.get('/logout', usersController.logoutHandle);
router.get('/pending', (req, res) => res.render('pending'));

// --- Protected Routes (Profile) ---
router.get('/profile', isAuthenticated, usersController.getProfilePage);
router.post('/profile', isAuthenticated, usersController.updatePassword); // Change PW

// --- Admin Management Routes ---
// These are protected by isAdmin inside the controller or index.js, 
// but we explicitly define the paths here.

router.get('/manage', isAuthenticated, isAdmin, usersController.getManageUsersPage);
router.post('/add', isAuthenticated, isAdmin, usersController.addUser);

// IMPORTANT: Toggle remains GET because it's a link <a href="...">
router.get('/toggle/:id', isAuthenticated, isAdmin, usersController.toggleUserStatus);

// IMPORTANT: Delete is POST because it's a form <form method="POST">
router.post('/delete/:id', isAuthenticated, isAdmin, usersController.deleteUser);

// Approve/Decline (Links)
router.get('/approve/:id', isAuthenticated, isAdmin, usersController.approveUser);
router.get('/decline/:id', isAuthenticated, isAdmin, usersController.declineUser);

module.exports = router;