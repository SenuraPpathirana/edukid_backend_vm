import { supabase } from '../../config/supabase.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Generate a new admin invite token
 * @param {string} createdBy - Parent ID of the admin creating the invite
 * @param {object} options - Optional configuration (maxUses, expiresAt)
 * @returns {Promise<{token: string, invite: object}>}
 */
const generateAdminToken = async (createdBy, options = {}) => {
  try {
    // Generate a random 16-character token
    const token = crypto.randomBytes(8).toString('hex'); // 16 hex characters
    
    // Hash the token for storage
    const tokenHash = await bcrypt.hash(token, 10);
    
    // Calculate expiration (default: 7 days from now)
    const expiresAt = options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Insert into admin_invites table
    const { data, error } = await supabase
      .from('admin_invites')
      .insert({
        token_hash: tokenHash,
        created_by: createdBy,
        expires_at: expiresAt,
        max_uses: options.maxUses || 1,
        is_active: true,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create admin invite: ${error.message}`);
    }
    
    // Return the plain token (only time it's visible) and the invite record
    return {
      token,
      invite: data,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify an admin token only (without creating request)
 * @param {string} token - The plain text token
 * @returns {Promise<boolean>}
 */
const verifyTokenOnly = async (token) => {
  try {
    // Get all active invites
    const { data: invites, error: fetchError } = await supabase
      .from('admin_invites')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());
    
    if (fetchError || !invites || invites.length === 0) {
      return false;
    }
    
    // Find matching token by comparing hashes
    for (const invite of invites) {
      const isMatch = await bcrypt.compare(token, invite.token_hash);
      if (isMatch && invite.used_count < invite.max_uses) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
};

/**
 * Verify an admin token and create a request
 * @param {string} token - The plain text token
 * @param {string} userId - Parent ID of the user requesting admin access
 * @returns {Promise<object>}
 */
const verifyAndCreateRequest = async (token, userId) => {
  try {
    console.log('🔍 Verifying token and creating request for user:', userId);
    
    // Get all active invites
    const { data: invites, error: fetchError } = await supabase
      .from('admin_invites')
      .select('*')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());
    
    if (fetchError) {
      throw new Error(`Failed to fetch invites: ${fetchError.message}`);
    }
    
    console.log('📋 Found active invites:', invites?.length || 0);
    
    if (!invites || invites.length === 0) {
      throw new Error('Invalid or expired token');
    }
    
    // Find matching token by comparing hashes
    let matchedInvite = null;
    for (const invite of invites) {
      const isMatch = await bcrypt.compare(token, invite.token_hash);
      if (isMatch) {
        matchedInvite = invite;
        console.log('✅ Token matched invite:', invite.invite_id);
        break;
      }
    }
    
    if (!matchedInvite) {
      throw new Error('Invalid or expired token');
    }
    
    // Check if token has remaining uses
    if (matchedInvite.used_count >= matchedInvite.max_uses) {
      throw new Error('Token has reached maximum uses');
    }
    
    console.log('📊 Token usage:', matchedInvite.used_count, '/', matchedInvite.max_uses);
    
    // Check if user already has any pending or approved admin request
    const { data: existingRequests, error: checkError } = await supabase
      .from('admin_requests')
      .select('*')
      .eq('user_id', userId);
    
    if (checkError) {
      console.error('❌ Error checking existing requests:', checkError);
    }
    
    // Check for pending request
    const pendingRequest = existingRequests?.find(req => req.is_approved === null || req.is_approved === false);
    if (pendingRequest) {
      throw new Error('You already have a pending admin request');
    }
    
    // Check for approved request
    const approvedRequest = existingRequests?.find(req => req.is_approved === true);
    if (approvedRequest) {
      throw new Error('You are already approved as an admin');
    }
    
    // Create admin request
    const { data: request, error: requestError } = await supabase
      .from('admin_requests')
      .insert({
        user_id: userId,
        invite_id: matchedInvite.invite_id,
        is_approved: false,
      })
      .select()
      .single();
    
    if (requestError) {
      console.error('❌ Failed to create request:', requestError);
      throw new Error(`Failed to create admin request: ${requestError.message}`);
    }
    
    console.log('✅ Admin request created:', request.request_id);
    
    // Update user role to 'pending'
    const { error: roleUpdateError } = await supabase
      .from('user')
      .update({ role: 'pending' })
      .eq('user_id', userId);
    
    if (roleUpdateError) {
      console.error('❌ Failed to update user role:', roleUpdateError);
      throw new Error(`Failed to update user role: ${roleUpdateError.message}`);
    }
    
    console.log('✅ User role updated to pending');
    
    // Deactivate token: set used_count = 1 and is_active = false (same as registration flow)
    const { error: updateError } = await supabase
      .from('admin_invites')
      .update({ 
        used_count: 1,
        is_active: false
      })
      .eq('invite_id', matchedInvite.invite_id);
    
    if (updateError) {
      console.error('❌ Failed to deactivate token:', updateError);
    } else {
      console.log('✅ Token deactivated: used_count = 1, is_active = false');
    }
    
    return request;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all admin requests (for admin dashboard)
 * @param {object} filters - Optional filters (is_approved)
 * @returns {Promise<Array>}
 */
const getAdminRequests = async (filters = {}) => {
  try {
    let query = supabase
      .from('admin_requests')
      .select(`
        *,
        user:user!admin_requests_user_id_fkey(user_id, fname, lname, email),
        invite:admin_invites(invite_id, created_at, expires_at)
      `)
      .order('requested_at', { ascending: false });
    
    if (filters.is_approved !== undefined) {
      query = query.eq('is_approved', filters.is_approved);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch admin requests: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Approve or reject an admin request
 * @param {string} requestId - UUID of the admin request
 * @param {string} approvedBy - Parent ID of the approver
 * @param {boolean} approve - True to approve, false to reject
 * @returns {Promise<object>}
 */
const processAdminRequest = async (requestId, approvedBy, approve) => {
  try {
    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from('admin_requests')
      .select('*, user:user!admin_requests_user_id_fkey(user_id, role)')
      .eq('request_id', requestId)
      .single();
    
    if (fetchError || !request) {
      throw new Error('Admin request not found');
    }
    
    if (request.is_approved) {
      throw new Error('Request has already been processed');
    }
    
    if (approve) {
      // Update the request
      const { error: updateRequestError } = await supabase
        .from('admin_requests')
        .update({
          is_approved: true,
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .eq('request_id', requestId);
      
      if (updateRequestError) {
        throw new Error(`Failed to approve request: ${updateRequestError.message}`);
      }
      
      // Update user role to 'admin'
      const { error: updateUserError } = await supabase
        .from('user')
        .update({ role: 'admin' })
        .eq('user_id', request.user_id);
      
      if (updateUserError) {
        throw new Error(`Failed to update user role: ${updateUserError.message}`);
      }
      
      return { message: 'Admin request approved successfully', approved: true };
    } else {
      // Reject: Update request and change user role to 'user'
      const { error: updateRequestError } = await supabase
        .from('admin_requests')
        .update({
          is_approved: false,
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .eq('request_id', requestId);
      
      if (updateRequestError) {
        throw new Error(`Failed to reject request: ${updateRequestError.message}`);
      }
      
      // Update user role to 'user' (default)
      const { error: updateUserError } = await supabase
        .from('user')
        .update({ role: 'user' })
        .eq('user_id', request.user_id);
      
      if (updateUserError) {
        throw new Error(`Failed to update user role: ${updateUserError.message}`);
      }
      
      return { message: 'Admin request rejected', approved: false };
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Get all admin invites created by a specific admin
 * @param {string} createdBy - Parent ID of the admin
 * @returns {Promise<Array>}
 */
const getAdminInvites = async (createdBy = null) => {
  try {
    let query = supabase
      .from('admin_invites')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (createdBy) {
      query = query.eq('created_by', createdBy);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch admin invites: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Deactivate an admin invite
 * @param {string} inviteId - UUID of the invite
 * @returns {Promise<object>}
 */
const deactivateInvite = async (inviteId) => {
  try {
    const { data, error } = await supabase
      .from('admin_invites')
      .update({ is_active: false })
      .eq('invite_id', inviteId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to deactivate invite: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Create a new user with email and password
 * @param {string} email - User email
 * @param {string} password - Temporary password
 * @returns {Promise<object>}
 */
const createUser = async (email, password) => {
  try {
    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('user')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();
    
    if (checkError) {
      throw new Error(`Failed to check existing user: ${checkError.message}`);
    }
    
    if (existingUser) {
      throw new Error('Email already exists');
    }
    
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Generate user ID
    const user_id = `USER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create user
    const { data: user, error: createError } = await supabase
      .from('user')
      .insert({
        user_id,
        email,
        password_hash: passwordHash,
        fname: email.split('@')[0], // Use email prefix as default first name
        lname: '',
        role: 'user',
        is_verified: true, // Admin-created users are pre-verified
        account_status: 'Active',
        join_date: new Date().toISOString().split('T')[0],
      })
      .select('user_id, email, fname, lname, role, is_verified, join_date')
      .single();
    
    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }
    
    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all users with their admin requests
 * @returns {Promise<Array>}
 */
const getAllUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('user')
      .select(`
        user_id,
        fname,
        lname,
        email,
        contact_number,
        role,
        is_verified,
        join_date,
        admin_requests!admin_requests_user_id_fkey(
          request_id,
          requested_at,
          is_approved
        )
      `)
      .order('email', { ascending: true });
    
    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all error reports with user information
 * @param {string} status - Optional status filter (Pending, Resolved, etc.)
 * @returns {Promise<Array>}
 */
const getErrorReports = async (status = null) => {
  try {
    let query = supabase
      .from('error_report')
      .select(`
        *,
        user:user!error_report_user_id_fkey(user_id, fname, lname, email)
      `)
      .order('submitted_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch error reports: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Update error report status
 * @param {string} reportId - Error report ID
 * @param {string} status - New status (Pending, In Progress, Resolved, Closed)
 * @returns {Promise<object>}
 */
const updateErrorReportStatus = async (reportId, status) => {
  try {
    const { data, error } = await supabase
      .from('error_report')
      .update({ status })
      .eq('error_report_id', reportId)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update error report status: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

export {
  generateAdminToken,
  verifyTokenOnly,
  verifyAndCreateRequest,
  getAdminRequests,
  processAdminRequest,
  getAdminInvites,
  deactivateInvite,
  createUser,
  getAllUsers,
  getErrorReports,
  updateErrorReportStatus,
};


