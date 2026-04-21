import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { requireAuth } from "../auth/auth.middleware.js";

const router = Router();

// GET /timers - Get all timers for the authenticated user
router.get("/", requireAuth, async (req, res) => {
  const { user_id } = req.user;

  try {
    const { data, error } = await supabase
      .from("timer")
      .select(`
        timer_id,
        duration,
        start_time,
        total_time,
        end_time,
        kid_id,
        status,
        paused_at,
        total_paused_seconds,
        kid_profile!inner(kid_id, fname, lname)
      `)
      .eq("user_id", user_id)
      .order("start_time", { ascending: false });

    if (error) {
      console.error("Error fetching timers:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ timers: data || [] });
  } catch (err) {
    console.error("Error fetching timers:", err);
    res.status(500).json({ error: "Failed to fetch timers" });
  }
});

// GET /timers/active - Get active timers for all kids
router.get("/active", requireAuth, async (req, res) => {
  const { user_id } = req.user;

  try {
    // Get active timers (where end_time is null)
    const { data, error } = await supabase
      .from("timer")
      .select(`
        timer_id,
        duration,
        start_time,
        total_time,
        end_time,
        kid_id,
        status,
        paused_at,
        total_paused_seconds,
        kid_profile!inner(kid_id, fname, lname)
      `)
      .eq("user_id", user_id)
      .is("end_time", null)
      .order("start_time", { ascending: false });

    if (error) {
      console.error("Error fetching active timers:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ timers: data || [] });
  } catch (err) {
    console.error("Error fetching active timers:", err);
    res.status(500).json({ error: "Failed to fetch active timers" });
  }
});

// POST /timers - Start a new timer for a kid
router.post("/", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { kid_id, duration } = req.body;

  // Validation
  if (!kid_id || !duration) {
    return res.status(400).json({ 
      error: "kid_id and duration are required" 
    });
  }

  // Validate duration
  const durationNum = parseInt(duration);
  if (isNaN(durationNum) || durationNum <= 0) {
    return res.status(400).json({ error: "Duration must be a positive number" });
  }

  try {
    // Check if kid belongs to user
    const { data: kid, error: kidError } = await supabase
      .from("kid_profile")
      .select("kid_id")
      .eq("kid_id", kid_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (kidError || !kid) {
      return res.status(404).json({ error: "Kid profile not found" });
    }

    // Auto-stop any existing active (zombie) timers for this kid before creating a new one
    const { data: existingTimers } = await supabase
      .from("timer")
      .select("timer_id, start_time, duration")
      .eq("kid_id", kid_id)
      .eq("user_id", user_id)
      .is("end_time", null);

    if (existingTimers && existingTimers.length > 0) {
      const now = new Date().toISOString();
      const stopIds = existingTimers.map(t => t.timer_id);
      console.log(`🧹 Auto-stopping ${stopIds.length} zombie timer(s) for kid ${kid_id}:`, stopIds);
      await supabase
        .from("timer")
        .update({ end_time: now, total_time: durationNum, status: 'stopped' })
        .in("timer_id", stopIds);
    }

    // Generate timer_id
    const timer_id = `TIMER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('🚀 Creating timer with data:', {
      timer_id,
      kid_id,
      user_id,
      duration: durationNum,
      total_time: null,
      end_time: null,
    });

    // Insert timer with NULL for end_time and total_time (not spent yet)
    const { data, error } = await supabase
      .from("timer")
      .insert([{
        timer_id: timer_id,
        kid_id: kid_id,
        user_id: user_id,
        duration: durationNum,
        start_time: new Date().toISOString(),
        total_time: null,
        end_time: null,
        status: 'running',
        paused_at: null,
        total_paused_seconds: 0,
      }])
      .select(`
        timer_id,
        duration,
        start_time,
        total_time,
        end_time,
        kid_id,
        status,
        paused_at,
        total_paused_seconds,
        kid_profile!inner(kid_id, fname, lname)
      `)
      .single();

    if (error) {
      console.error("❌ Error creating timer:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Timer created successfully:', {
      timer_id: data.timer_id,
      start_time: data.start_time,
      end_time: data.end_time,
      total_time: data.total_time,
      duration: data.duration,
    });

    res.status(201).json({ 
      message: "Timer started successfully",
      timer: data 
    });
  } catch (err) {
    console.error("Error creating timer:", err);
    res.status(500).json({ error: "Failed to start timer" });
  }
});

// PUT /timers/:id/stop - Stop an active timer
router.put("/:id/stop", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;

  try {
    // Check if timer exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from("timer")
      .select("*")
      .eq("timer_id", id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!existing) {
      return res.status(404).json({ error: "Timer not found" });
    }

    if (existing.end_time) {
      return res.status(400).json({ error: "Timer is already stopped" });
    }

    // Calculate actual elapsed time in minutes
    const endTime = new Date();
    const startTime = new Date(existing.start_time);
    const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    console.log('🛑 Stopping timer - Calculated:', {
      elapsed_seconds: elapsedSeconds,
      elapsed_minutes: elapsedMinutes,
    });

    // Update timer with end_time and calculated total_time
    const { data, error } = await supabase
      .from("timer")
      .update({
        end_time: endTime.toISOString(),
        total_time: elapsedMinutes,
        status: 'stopped',
      })
      .eq("timer_id", id)
      .eq("user_id", user_id)
      .select(`
        timer_id,
        duration,
        start_time,
        total_time,
        end_time,
        kid_id,
        status,
        paused_at,
        total_paused_seconds,
        kid_profile!inner(kid_id, fname, lname)
      `)
      .single();

    if (error) {
      console.error("Error stopping timer:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Timer stopped - Database returned:', {
      total_time: data.total_time,
      expected: elapsedMinutes,
      match: data.total_time === elapsedMinutes,
    });

    res.json({ 
      message: "Timer stopped successfully",
      timer: data 
    });
  } catch (err) {
    console.error("Error stopping timer:", err);
    res.status(500).json({ error: "Failed to stop timer" });
  }
});

// DELETE /timers/:id - Delete a timer
router.delete("/:id", requireAuth, async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("timer")
      .delete()
      .eq("timer_id", id)
      .eq("user_id", user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Timer deleted successfully" });
  } catch (err) {
    console.error("Error deleting timer:", err);
    res.status(500).json({ error: "Failed to delete timer" });
  }
});

export default router;
