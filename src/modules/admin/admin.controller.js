import * as adminService from './admin.service.js';

/**
 * Generate a new admin token
 * POST /api/admin/generate-token
 */
const generateToken = async (req, res) => {
  try {
    const { user_id } = req.user; // From auth middleware
    const { maxUses, expiresAt } = req.body;
    
    const result = await adminService.generateAdminToken(user_id, {
      maxUses,
      expiresAt,
    });
    
    res.status(201).json({
      message: 'Admin token generated successfully',
      token: result.token, // Plain text token (only shown once)
      invite: {
        invite_id: result.invite.invite_id,
        created_at: result.invite.created_at,
        expires_at: result.invite.expires_at,
        max_uses: result.invite.max_uses,
        used_count: result.invite.used_count,
      },
    });
  } catch (error) {
    console.error('Generate token error:', error);
    res.status(500).json({
      message: 'Failed to generate admin token',
      error: error.message,
    });
  }
};

/**
 * Verify admin token (public endpoint)
 * POST /api/admin/verify-token
 */
const verifyToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }
    
    // Just verify the token exists and is valid
    const isValid = await adminService.verifyTokenOnly(token);
    
    res.status(200).json({
      message: 'Token verified successfully',
      valid: isValid,
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(400).json({
      message: error.message || 'Invalid or expired token',
      valid: false,
    });
  }
};

/**
 * Create admin request (authenticated - after login)
 * POST /api/admin/create-request
 */
const createAdminRequest = async (req, res) => {
  try {
    const { user_id } = req.user; // From auth middleware
    const { token } = req.body;
    
    console.log('📝 Create admin request - User ID:', user_id);
    console.log('🔑 Token received:', token ? token.substring(0, 8) + '...' : 'missing');
    
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }
    
    const request = await adminService.verifyAndCreateRequest(token, user_id);
    console.log('✅ Admin request created:', request.request_id);
    
    res.status(201).json({
      message: 'Admin request created successfully. Awaiting approval.',
      request,
    });
  } catch (error) {
    console.error('❌ Create admin request error:', error.message);
    res.status(400).json({
      message: error.message || 'Failed to create admin request',
    });
  }
};

/**
 * Get all admin requests
 * GET /api/admin/requests
 */
const getRequests = async (req, res) => {
  try {
    const { is_approved } = req.query;
    
    const filters = {};
    if (is_approved !== undefined) {
      filters.is_approved = is_approved === 'true';
    }
    
    const requests = await adminService.getAdminRequests(filters);
    
    res.status(200).json({
      message: 'Admin requests retrieved successfully',
      requests,
    });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({
      message: 'Failed to retrieve admin requests',
      error: error.message,
    });
  }
};

/**
 * Approve or reject an admin request
 * PATCH /api/admin/requests/:requestId
 */
const processRequest = async (req, res) => {
  try {
    const { user_id } = req.user; // From auth middleware
    const { requestId } = req.params;
    const { approve } = req.body; // true or false
    
    if (approve === undefined) {
      return res.status(400).json({ message: 'approve field is required' });
    }
    
    const result = await adminService.processAdminRequest(
      requestId,
      user_id,
      approve
    );
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Process request error:', error);
    res.status(400).json({
      message: error.message || 'Failed to process admin request',
    });
  }
};

/**
 * Get all admin invites
 * GET /api/admin/invites
 */
const getInvites = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { all } = req.query; // If 'all=true', get all invites (super admin)
    
    const createdBy = all === 'true' ? null : user_id;
    const invites = await adminService.getAdminInvites(createdBy);
    
    res.status(200).json({
      message: 'Admin invites retrieved successfully',
      invites,
    });
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({
      message: 'Failed to retrieve admin invites',
      error: error.message,
    });
  }
};

/**
 * Deactivate an admin invite
 * PATCH /api/admin/invites/:inviteId/deactivate
 */
const deactivateInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    
    const invite = await adminService.deactivateInvite(inviteId);
    
    res.status(200).json({
      message: 'Admin invite deactivated successfully',
      invite,
    });
  } catch (error) {
    console.error('Deactivate invite error:', error);
    res.status(400).json({
      message: error.message || 'Failed to deactivate invite',
    });
  }
};

/**
 * Create a new user
 * POST /api/admin/users
 */
const createUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const user = await adminService.createUser(email, password);
    
    res.status(201).json({
      message: 'User created successfully',
      user,
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({
      message: error.message || 'Failed to create user',
    });
  }
};

/**
 * Get all users
 * GET /api/admin/users
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    
    res.status(200).json({
      message: 'Users retrieved successfully',
      users,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      message: 'Failed to retrieve users',
      error: error.message,
    });
  }
};

/**
 * Get all error reports
 * GET /api/admin/error-reports
 */
const getErrorReports = async (req, res) => {
  try {
    const { status } = req.query;
    
    const reports = await adminService.getErrorReports(status);
    
    res.status(200).json({
      message: 'Error reports retrieved successfully',
      reports,
    });
  } catch (error) {
    console.error('Get error reports error:', error);
    res.status(500).json({
      message: 'Failed to retrieve error reports',
      error: error.message,
    });
  }
};

/**
 * Update error report status
 * PATCH /api/admin/error-reports/:reportId
 */
const updateErrorReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    
    const report = await adminService.updateErrorReportStatus(reportId, status);
    
    res.status(200).json({
      message: 'Error report status updated successfully',
      report,
    });
  } catch (error) {
    console.error('Update error report status error:', error);
    res.status(400).json({
      message: error.message || 'Failed to update error report status',
    });
  }
};

export {
  generateToken,
  verifyToken,
  createAdminRequest,
  getRequests,
  processRequest,
  getInvites,
  deactivateInvite,
  createUser,
  getAllUsers,
  getErrorReports,
  updateErrorReportStatus,
};


