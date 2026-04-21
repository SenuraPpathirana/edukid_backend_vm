import { supabase } from "../../config/supabase.js";

// Get progress for a specific kid
export const getKidProgress = async (req, res) => {
  try {
    const { kid_id } = req.params;

    const { data, error } = await supabase
      .from("progress")
      .select(`
        *,
        kid_profile!inner(
          kid_id,
          fname,
          lname,
          age,
          grade
        )
      `)
      .eq("kid_id", kid_id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Progress not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching kid progress:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get progress for all kids of a user
export const getUserKidsProgress = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("progress")
      .select(`
        *,
        kid_profile!inner(
          kid_id,
          fname,
          lname,
          age,
          grade,
          user_id
        )
      `)
      .eq("kid_profile.user_id", user_id)
      .order("last_updated", { ascending: false });

    if (error) throw error;

    const kidIds = (data || []).map((item) => item.kid_id).filter(Boolean);
    let quiz_sessions = [];

    if (kidIds.length > 0) {
      const { data: sessionData, error: sessionError } = await supabase
        .from("kid_quiz")
        .select("kid_id, quiz_id, start_time, end_time, completion_status")
        .in("kid_id", kidIds)
        .not("start_time", "is", null)
        .not("end_time", "is", null);

      if (sessionError) throw sessionError;
      quiz_sessions = sessionData || [];
    }

    res.json({ progress: data || [], quiz_sessions });
  } catch (error) {
    console.error("Error fetching user kids progress:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create or update progress
export const upsertProgress = async (req, res) => {
  try {
    const {
      progress_id,
      kid_id,
      total_quizzes,
      total_games,
      score,
    } = req.body;

    // Verify kid belongs to user
    const user_id = req.user?.user_id;
    const { data: kidData, error: kidError } = await supabase
      .from("kid_profile")
      .select("user_id")
      .eq("kid_id", kid_id)
      .single();

    if (kidError || !kidData || kidData.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized to modify this kid's progress" });
    }

    // Fetch existing progress to preserve total_time
    const { data: existingProgress } = await supabase
      .from("progress")
      .select("total_time")
      .eq("kid_id", kid_id)
      .maybeSingle();

    const progressData = {
      progress_id: progress_id || `prog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      kid_id,
      total_quizzes: total_quizzes || 0,
      total_games: total_games || 0,
      score: score || 0,
      last_updated: new Date().toISOString(),
      total_time: existingProgress?.total_time || null,
    };

    const { data, error } = await supabase
      .from("progress")
      .upsert(progressData, { onConflict: "progress_id" })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Progress updated successfully", progress: data });
  } catch (error) {
    console.error("Error upserting progress:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update progress stats (increment quizzes/games)
export const updateProgressStats = async (req, res) => {
  try {
    const { kid_id } = req.params;
    const { increment_quizzes, increment_games, add_score } = req.body;

    // Verify kid belongs to user
    const user_id = req.user?.user_id;
    const { data: kidData, error: kidError } = await supabase
      .from("kid_profile")
      .select("user_id")
      .eq("kid_id", kid_id)
      .single();

    if (kidError || !kidData || kidData.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get current progress
    const { data: currentProgress, error: fetchError } = await supabase
      .from("progress")
      .select("*")
      .eq("kid_id", kid_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const updatedData = {
      kid_id,
      total_quizzes: (currentProgress?.total_quizzes || 0) + (increment_quizzes || 0),
      total_games: (currentProgress?.total_games || 0) + (increment_games || 0),
      score: (currentProgress?.score || 0) + (add_score || 0),
      last_updated: new Date().toISOString(),
      progress_id: currentProgress?.progress_id || `prog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      total_time: currentProgress?.total_time || null,
    };

    const { data, error } = await supabase
      .from("progress")
      .upsert(updatedData, { onConflict: "progress_id" })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Progress stats updated", progress: data });
  } catch (error) {
    console.error("Error updating progress stats:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get leaderboard/top performers
export const getLeaderboard = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { data, error } = await supabase
      .from("progress")
      .select(`
        *,
        kid_profile!inner(
          kid_id,
          fname,
          lname,
          age,
          grade
        )
      `)
      .order("score", { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ leaderboard: data || [] });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: error.message });
  }
};
