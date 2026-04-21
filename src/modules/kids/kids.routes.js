import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = Router();

// GET /kids - Get all kids for the authenticated user
router.get("/", requireAuth, async (req, res) => {
  const { user_id } = req.user;

  try {
    const { data, error } = await supabase
      .from("kid_profile")
      .select("*")
      .eq("user_id", user_id)
      .order("created_date", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ kids: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch kid profiles" });
  }
});

// POST /kids - Create a new kid profile
router.post("/", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { firstName, lastName, grade, age, gender, medium } = req.body;

  // Validation
  if (!firstName || !lastName || !grade || !age) {
    return res.status(400).json({ 
      error: "All fields are required (firstName, lastName, grade, age)" 
    });
  }

  // Validate age
  const ageNum = parseInt(age);
  if (isNaN(ageNum) || ageNum < 1 || ageNum > 18) {
    return res.status(400).json({ error: "Age must be between 1 and 18" });
  }

  // Generate kid_id
  const kid_id = `KID-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const { data, error } = await supabase
      .from("kid_profile")
      .insert({
        kid_id: kid_id,
        user_id: user_id,
        fname: firstName,
        lname: lastName,
        grade: grade.toString(),
        age: ageNum,
        medium: medium || 'English',
        created_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        premium_status: 'Free',
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating kid profile:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ 
      message: "Kid profile created successfully",
      kid: data 
    });
  } catch (err) {
    console.error("Error creating kid profile:", err);
    res.status(500).json({ error: "Failed to create kid profile" });
  }
});

// PUT /kids/:id - Update a kid profile
router.put("/:id", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;
  const { firstName, lastName, grade, age, medium } = req.body;

  try {
    // First check if the kid profile belongs to the authenticated user
    const { data: existing, error: fetchError } = await supabase
      .from("kid_profile")
      .select("*")
      .eq("kid_id", id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!existing) {
      return res.status(404).json({ error: "Kid profile not found" });
    }

    // Update the profile
    const updateData = {};
    if (firstName) updateData.fname = firstName;
    if (lastName) updateData.lname = lastName;
    if (grade) updateData.grade = grade.toString();
    if (age) updateData.age = parseInt(age);
    if (medium) updateData.medium = medium;

    const { data, error } = await supabase
      .from("kid_profile")
      .update(updateData)
      .eq("kid_id", id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ 
      message: "Kid profile updated successfully",
      kid: data 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update kid profile" });
  }
});

// PATCH /kids/:id/premium — deprecated, premium is now tracked via subscription.is_active
router.patch("/:id/premium", requireAuth, (_req, res) => {
  return res.status(410).json({ error: "Per-kid premium status is no longer used. Premium access is determined by the user's active subscription." });
});

// DELETE /kids/:id - Delete a kid profile
router.delete("/:id", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("kid_profile")
      .delete()
      .eq("kid_id", id)
      .eq("user_id", user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Kid profile deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete kid profile" });
  }
});

export default router;
