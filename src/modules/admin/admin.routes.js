import express from 'express';
import * as adminController from './admin.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

// Verify admin token (public - before signup)
router.post('/verify-token', adminController.verifyToken);

// All other admin routes require authentication
router.use(authenticate);

// Create admin request (authenticated - after signup and login)
router.post('/create-request', adminController.createAdminRequest);

// Generate admin token
router.post('/generate-token', adminController.generateToken);

// Get all admin requests
router.get('/requests', adminController.getRequests);

// Approve/reject admin request
router.patch('/requests/:requestId', adminController.processRequest);

// Get all admin invites
router.get('/invites', adminController.getInvites);

// Deactivate an admin invite
router.patch('/invites/:inviteId/deactivate', adminController.deactivateInvite);

// Get all users
router.get('/users', adminController.getAllUsers);

// Create a new user
router.post('/users', adminController.createUser);

// Get all error reports
router.get('/error-reports', adminController.getErrorReports);

// Update error report status
router.patch('/error-reports/:reportId', adminController.updateErrorReportStatus);

export default router;


