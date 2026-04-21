import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { requireAuth } from "../auth/auth.middleware.js";
import bcrypt from "bcrypt";

const router = Router();

// GET /me (protected)
router.get("/me", requireAuth, async (req, res) => {
  const { user_id } = req.user;

  const { data, error } = await supabase
    .from("user")
    .select("user_id, fname, lname, email, gender, contact_number, address, default_language, account_status, is_verified, role, join_date")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "User not found" });

  res.json({ user: data });
});

// PUT /me (protected) - Update profile
router.put("/me", requireAuth, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { fname, lname, gender, contact_number, address, email, current_password, new_password } = req.body;

    console.log('📝 Updating profile for user:', user_id);

    // Build update object with only provided fields
    const updates = {};
    if (fname) updates.fname = fname;
    if (lname) updates.lname = lname;
    if (gender) updates.gender = gender;
    if (contact_number) updates.contact_number = contact_number;
    if (address) updates.address = address;
    if (req.body.default_language) updates.default_language = req.body.default_language;

    // Handle email change (requires verification)
    if (email) {
      // Check if email is already taken by another user
      const { data: existingUser } = await supabase
        .from("user")
        .select("user_id")
        .eq("email", email)
        .neq("user_id", user_id)
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({ error: "Email already in use by another account" });
      }

      updates.email = email;
      updates.is_verified = false; // Require re-verification
    }

    // Handle password change
    if (current_password && new_password) {
      // Get current password hash
      const { data: userData, error: fetchError } = await supabase
        .from("user")
        .select("password_hash")
        .eq("user_id", user_id)
        .single();

      if (fetchError || !userData) {
        return res.status(500).json({ error: "Failed to verify current password" });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(current_password, userData.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(new_password, 10);
      updates.password_hash = hashedPassword;
    }

    // Update user profile
    const { data, error } = await supabase
      .from("user")
      .update(updates)
      .eq("user_id", user_id)
      .select("user_id, fname, lname, email, gender, contact_number, address, default_language, account_status, is_verified, role, join_date")
      .single();

    if (error) {
      console.error('❌ Update error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Profile updated successfully');

    res.json({ 
      message: "Profile updated successfully",
      user: data,
      email_changed: !!email,
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /me/report-error (protected) - Submit an error report
router.post("/me/report-error", requireAuth, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { subject, message, app_version, device_info } = req.body || {};

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required" });
    }
    if (subject.length > 255) {
      return res.status(400).json({ error: "Subject must be 255 characters or less" });
    }

    const error_report_id = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const { data, error } = await supabase
      .from("error_report")
      .insert({
        error_report_id,
        user_id,
        subject: subject.trim(),
        message: message.trim(),
        status: "Pending",
        submitted_at: new Date().toISOString(),
        app_version: app_version || null,
        device_info: device_info || null,
      })
      .select("error_report_id, subject, status, submitted_at")
      .single();

    if (error) {
      console.error("❌ Error saving error_report:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ Error report ${data.error_report_id} submitted by user ${user_id}: "${subject}"`);
    res.status(201).json({
      message: "Error report submitted successfully",
      report: data,
    });
  } catch (e) {
    console.error("Report error:", e);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

export default router;


