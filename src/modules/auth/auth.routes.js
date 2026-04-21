import { Router } from "express";
import bcrypt from "bcrypt";
import { supabase } from "../../config/supabase.js";
import { isValidEmail, isStrongPassword, normalizeEmail } from "../../utils/validators.js";
import { generateOtp6, otpExpiryDate } from "../../utils/otp.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../email/email.service.js";
import { signAccessToken } from "../../utils/jwt.js";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const {
      fname,
      lname,
      email,
      password,
      contact_number,
      address,
      gender,
      role,
      adminToken
    } = req.body || {}; // ✅ prevents destructure crash

    // ✅ basic check
    if (!req.body) return res.status(400).json({ error: "Missing JSON body. Send raw JSON + Content-Type header." });

    const emailNorm = normalizeEmail(email);

    if (!fname || !lname) return res.status(400).json({ error: "First/Last name required" });
    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });
    if (!isStrongPassword(password))
      return res.status(400).json({ error: "Weak password (min 8, upper, lower, number)" });

    // check existing
    const { data: existing, error: existErr } = await supabase
      .from("user")
      .select("user_id")
      .eq("email", emailNorm)
      .maybeSingle();

    if (existErr) return res.status(500).json({ error: existErr.message });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const password_hash = await bcrypt.hash(password, 10);

    console.log('📝 Registering user with role:', role || 'user (default)');

    const { data: userRow, error: userErr } = await supabase
      .from("user")
      .insert([{
        fname,
        lname,
        email: emailNorm,
        contact_number: contact_number ?? null,
        address: address ?? null,
        gender: gender ?? null,
        password_hash,
        is_verified: false,
        role: role || 'user', // Set role (default to 'user' if not provided)
        join_date: new Date().toISOString().split('T')[0],
        account_status: 'Free',
      }])
      .select("user_id, email, is_verified, role")
      .single();

    if (userErr) return res.status(400).json({ error: userErr.message });

    // If admin token provided, deactivate it immediately
    if (adminToken && role === 'pending') {
      console.log('🔐 Admin token provided, deactivating token...');
      
      // Get all active invites
      const { data: invites, error: fetchError } = await supabase
        .from('admin_invites')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (fetchError) {
        console.error('❌ Failed to fetch invites:', fetchError);
      } else if (invites && invites.length > 0) {
        // Find matching token by comparing hashes
        let matchedInvite = null;
        for (const invite of invites) {
          const isMatch = await bcrypt.compare(adminToken, invite.token_hash);
          if (isMatch) {
            matchedInvite = invite;
            console.log('✅ Token matched invite:', invite.invite_id);
            break;
          }
        }

        if (matchedInvite) {
          // Create admin request
          const { error: requestError } = await supabase
            .from('admin_requests')
            .insert({
              user_id: userRow.user_id,
              invite_id: matchedInvite.invite_id,
              is_approved: false,
            });

          if (requestError) {
            console.error('❌ Failed to create admin request:', requestError);
          } else {
            console.log('✅ Admin request created for user:', userRow.user_id);
          }

          // Deactivate token: set used_count = 1 and is_active = false
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
        }
      }
    }

    const otp = generateOtp6();
    const expires_at = otpExpiryDate(Number(process.env.OTP_EXPIRES_MIN || 10));

    const { error: otpErr } = await supabase
      .from("email_verifications")
      .insert([{
        user_id: userRow.user_id,
        otp,
        expires_at,
        is_used: false,
      }]);

    if (otpErr) return res.status(400).json({ error: otpErr.message });

    // Send verification email
    try {
      await sendVerificationEmail(emailNorm, otp, fname);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue even if email fails - user can resend
    }

    const response = {
      message: "Registered successfully. Please check your email for the verification code.",
      user: userRow
    };

    return res.status(201).json(response);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!req.body) return res.status(400).json({ error: "Missing JSON body" });

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });
    if (!otp || String(otp).length !== 6) return res.status(400).json({ error: "Invalid OTP format" });

    // Get user
    const { data: user, error: userErr } = await supabase
      .from("user")
      .select("user_id, email, is_verified, account_status, role")
      .eq("email", emailNorm)
      .maybeSingle();

    if (userErr) return res.status(500).json({ error: userErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.is_verified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // Get latest OTP record for this user
    const { data: otpRecord, error: otpErr } = await supabase
      .from("email_verifications")
      .select("otp, expires_at, is_used")
      .eq("user_id", user.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr) return res.status(500).json({ error: otpErr.message });
    if (!otpRecord) return res.status(404).json({ error: "No OTP found. Please request a new one." });

    // Check if OTP is already used
    if (otpRecord.is_used) {
      return res.status(400).json({ error: "OTP already used. Please request a new one." });
    }

    // Check if OTP is expired
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (now > expiresAt) {
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }

    // Verify OTP match
    if (String(otpRecord.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Mark OTP as used
    const { error: updateOtpErr } = await supabase
      .from("email_verifications")
      .update({ is_used: true })
      .eq("user_id", user.user_id)
      .eq("otp", otp);

    if (updateOtpErr) return res.status(500).json({ error: updateOtpErr.message });

    // Mark user as verified
    const { error: verifyErr } = await supabase
      .from("user")
      .update({ is_verified: true })
      .eq("user_id", user.user_id);

    if (verifyErr) return res.status(500).json({ error: verifyErr.message });

    const accessToken = signAccessToken({
      user_id: user.user_id,
      role: user.role || "user",
      account_status: user.account_status,
    });

    return res.status(200).json({
      message: "Email verified successfully",
      accessToken,
      user: { ...user, is_verified: true }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!req.body) return res.status(400).json({ error: "Missing JSON body" });

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });

    // Get user
    const { data: user, error: userErr } = await supabase
      .from("user")
      .select("user_id, email, is_verified, fname")
      .eq("email", emailNorm)
      .maybeSingle();

    if (userErr) return res.status(500).json({ error: userErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.is_verified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // Mark all previous OTPs as used
    await supabase
      .from("email_verifications")
      .update({ is_used: true })
      .eq("user_id", user.user_id)
      .eq("is_used", false);

    // Generate new OTP
    const otp = generateOtp6();
    const expires_at = otpExpiryDate(Number(process.env.OTP_EXPIRES_MIN || 10));

    const { error: otpErr } = await supabase
      .from("email_verifications")
      .insert([{
        user_id: user.user_id,
        otp,
        expires_at,
        is_used: false,
      }]);

    if (otpErr) return res.status(400).json({ error: otpErr.message });

    // Send verification email
    try {
      await sendVerificationEmail(emailNorm, otp, user.fname || 'User');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    const response = {
      message: "New verification code sent to your email successfully"
    };

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const body = req.body;
    if (!body) return res.status(400).json({ error: "Missing JSON body" });

    const { email, password } = body;
    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });
    if (!password) return res.status(400).json({ error: "Password required" });

    // Find user by email
    const { data: parentRow, error: parentErr } = await supabase
      .from("user")
      .select("user_id, email, password_hash, is_verified, account_status, role")
      .eq("email", emailNorm)
      .maybeSingle();

    if (parentErr) return res.status(500).json({ error: parentErr.message });
    if (!parentRow) return res.status(401).json({ error: "Invalid email or password" });

    // Optional: block login if not verified
    if (!parentRow.is_verified) {
      return res.status(403).json({ error: "Email not verified" });
    }

    // Compare password
    const ok = await bcrypt.compare(password, parentRow.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    // Sign JWT with actual user role from database
    const accessToken = signAccessToken({
      user_id: parentRow.user_id,
      role: parentRow.role || "user",
      account_status: parentRow.account_status,
    });

    return res.json({
      message: "Login successful",
      accessToken,
      user: {
        user_id: parentRow.user_id,
        email: parentRow.email,
        account_status: parentRow.account_status,
        role: parentRow.role || 'user',
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Forgot Password - Request password reset OTP
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!req.body) return res.status(400).json({ error: "Missing JSON body" });

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });

    // Get user
    const { data: user, error: userErr } = await supabase
      .from("user")
      .select("user_id, email, is_verified, fname")
      .eq("email", emailNorm)
      .maybeSingle();

    if (userErr) return res.status(500).json({ error: userErr.message });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.status(200).json({ 
        message: "If this email exists, a password reset code has been sent." 
      });
    }

    // Mark all previous password reset OTPs as used
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true })
      .eq("user_id", user.user_id)
      .eq("is_used", false);

    // Generate new OTP for password reset
    const otp = generateOtp6();
    const expires_at = otpExpiryDate(Number(process.env.OTP_EXPIRES_MIN || 10));

    const { error: otpErr } = await supabase
      .from("password_reset_otps")
      .insert([{
        user_id: user.user_id,
        otp,
        expires_at,
        is_used: false,
      }]);

    if (otpErr) return res.status(400).json({ error: otpErr.message });

    // Send password reset email
    try {
      await sendPasswordResetEmail(emailNorm, otp, user.fname || 'User');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    const response = {
      message: "Password reset code sent to your email successfully"
    };

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Verify password reset OTP
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!req.body) return res.status(400).json({ error: "Missing JSON body" });

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });
    if (!otp || String(otp).length !== 6) return res.status(400).json({ error: "Invalid OTP format" });

    // Get user
    const { data: user, error: userErr } = await supabase
      .from("user")
      .select("user_id, email")
      .eq("email", emailNorm)
      .maybeSingle();

    if (userErr) return res.status(500).json({ error: userErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Get latest password reset OTP record for this user
    const { data: otpRecord, error: otpErr } = await supabase
      .from("password_reset_otps")
      .select("otp, expires_at, is_used")
      .eq("user_id", user.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr) return res.status(500).json({ error: otpErr.message });
    if (!otpRecord) return res.status(404).json({ error: "No password reset code found. Please request a new one." });

    // Check if OTP is already used
    if (otpRecord.is_used) {
      return res.status(400).json({ error: "Code already used. Please request a new one." });
    }

    // Check if OTP is expired
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (now > expiresAt) {
      return res.status(400).json({ error: "Code expired. Please request a new one." });
    }

    // Verify OTP match
    if (String(otpRecord.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ error: "Invalid code" });
    }

    // Mark OTP as used
    const { error: updateOtpErr } = await supabase
      .from("password_reset_otps")
      .update({ is_used: true })
      .eq("user_id", user.user_id)
      .eq("otp", otp);

    if (updateOtpErr) return res.status(500).json({ error: updateOtpErr.message });

    return res.status(200).json({
      message: "Code verified successfully. You can now reset your password.",
      email: emailNorm
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Reset password with new password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};

    if (!req.body) return res.status(400).json({ error: "Missing JSON body" });

    const emailNorm = normalizeEmail(email);

    if (!isValidEmail(emailNorm)) return res.status(400).json({ error: "Invalid email" });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: "Weak password (min 8, upper, lower, number)" });
    }

    // Get user
    const { data: user, error: userErr } = await supabase
      .from("user")
      .select("user_id, email")
      .eq("email", emailNorm)
      .maybeSingle();

    if (userErr) return res.status(500).json({ error: userErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Verify that user has a verified password reset OTP (recently used)
    const { data: recentOtp, error: otpCheckErr } = await supabase
      .from("password_reset_otps")
      .select("is_used, created_at")
      .eq("user_id", user.user_id)
      .eq("is_used", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpCheckErr) return res.status(500).json({ error: otpCheckErr.message });
    if (!recentOtp) {
      return res.status(403).json({ error: "Please verify your email with the reset code first" });
    }

    // Check if the verified OTP is recent (within 15 minutes)
    const now = new Date();
    const otpCreatedAt = new Date(recentOtp.created_at);
    const minutesSinceOtp = (now - otpCreatedAt) / (1000 * 60);
    
    if (minutesSinceOtp > 15) {
      return res.status(403).json({ error: "Reset code expired. Please request a new one." });
    }

    // Hash the new password
    const password_hash = await bcrypt.hash(newPassword, 10);

    // Update user's password
    const { error: updateErr } = await supabase
      .from("user")
      .update({ password_hash })
      .eq("user_id", user.user_id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.status(200).json({
      message: "Password reset successfully. You can now login with your new password."
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


export default router;


