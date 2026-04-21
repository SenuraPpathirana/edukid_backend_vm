import { supabase } from "../../config/supabase.js";

const buildGradeVariants = (gradeValue) => {
  const raw = String(gradeValue || "").trim();
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const compact = lower.replace(/[_\s]+/g, "-");

  const numericMatch = compact.match(/(\d+)/);
  const gradeNumber = numericMatch ? numericMatch[1] : "";

  const variants = new Set([
    raw,
    lower,
    compact,
  ]);

  if (gradeNumber) {
    variants.add(gradeNumber);
    variants.add(`grade-${gradeNumber}`);
    variants.add(`grade ${gradeNumber}`);
    variants.add(`Grade ${gradeNumber}`);
    variants.add(`grade_${gradeNumber}`);
  }

  return Array.from(variants);
};

const getDurationSeconds = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.floor((endMs - startMs) / 1000);
};

const formatSecondsToPgTime = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safeSeconds / 3600) % 24;
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const calculateTotalTimeForKid = async (kidId) => {
  let totalSeconds = 0;

  const { data: quizSessions, error: quizTimeError } = await supabase
    .from("kid_quiz")
    .select("start_time, end_time")
    .eq("kid_id", kidId)
    .not("start_time", "is", null)
    .not("end_time", "is", null);

  if (quizTimeError) {
    throw new Error(`Failed to calculate quiz time: ${quizTimeError.message}`);
  }

  totalSeconds += (quizSessions || []).reduce(
    (sum, session) => sum + getDurationSeconds(session.start_time, session.end_time),
    0
  );

  const { data: gameSessions, error: gameTimeError } = await supabase
    .from("kid_game")
    .select("*")
    .eq("kid_id", kidId);

  if (gameTimeError) {
    throw new Error(`Failed to calculate game time: ${gameTimeError.message}`);
  }

  totalSeconds += (gameSessions || []).reduce((sum, session) => {
    if (session.start_time && session.end_time) {
      return sum + getDurationSeconds(session.start_time, session.end_time);
    }

    const rowTotalTime = Number(session.total_time);
    if (Number.isFinite(rowTotalTime) && rowTotalTime > 0) {
      return sum + Math.floor(rowTotalTime);
    }

    const rowDuration = Number(session.duration);
    if (Number.isFinite(rowDuration) && rowDuration > 0) {
      return sum + Math.floor(rowDuration);
    }

    return sum;
  }, 0);

  return totalSeconds;
};

/**
 * Get single game by ID
 * @param {string} gameId - Game ID
 * @returns {Promise<object>} Game
 */
const getGameById = async (gameId) => {
  try {
    const { data, error } = await supabase
      .from("game")
      .select("*")
      .eq("game_id", gameId)
      .single();

    if (error) throw new Error(`Failed to fetch game: ${error.message}`);

    return data || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all games
 * @param {object} filters - Optional filters (grade, subject)
 * @returns {Promise<Array>} Array of games
 */
const getGames = async (filters = {}) => {
  try {
    let query = supabase
      .from("game")
      .select("*")
      .order("uploaded_date", { ascending: false });

    if (filters.grade) {
      const gradeVariants = buildGradeVariants(filters.grade);
      query = gradeVariants.length > 1
        ? query.in("grade", gradeVariants)
        : query.eq("grade", gradeVariants[0]);
    }
    if (filters.subject) {
      query = query.eq("subject", filters.subject);
    }
    if (filters.language) {
      query = query.ilike("language", filters.language);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch games: ${error.message}`);

    return data || [];
  } catch (error) {
    throw error;
  }
};

/**
 * Add new game
 * @param {object} gameData - Game information
 * @returns {Promise<object>} Created game
 */
const addGame = async (gameData) => {
  try {
    const game_id = `GAME-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from("game")
      .insert([{
        game_id: game_id,
        title: gameData.title,
        description: gameData.description,
        subject: gameData.subject || "General",
        grade: gameData.grade,
        language: gameData.language,
        access_type: gameData.access_level === "premium" ? "Premium" : "Free",
        file_url: gameData.game_url,
        max_score: parseInt(gameData.maximum_score) || 100,
        uploaded_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      }])
      .select()
      .single();

    if (error) throw new Error(`Failed to add game: ${error.message}`);

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Update a game
 * @param {string} gameId - Game ID
 * @param {object} gameData - Game information to update
 * @returns {Promise<object>} Updated game
 */
const updateGame = async (gameId, gameData) => {
  try {
    const { data, error } = await supabase
      .from("game")
      .update({
        title: gameData.title,
        description: gameData.description,
        subject: gameData.subject || "General",
        grade: gameData.grade,
        language: gameData.language,
        access_type: gameData.access_level === "premium" ? "Premium" : "Free",
        file_url: gameData.game_url,
        max_score: parseInt(gameData.maximum_score) || 100,
      })
      .eq("game_id", gameId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update game: ${error.message}`);

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete a game
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
const deleteGame = async (gameId) => {
  try {
    const { error } = await supabase
      .from("game")
      .delete()
      .eq("game_id", gameId);

    if (error) throw new Error(`Failed to delete game: ${error.message}`);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Start game session (records start_time)
 * @param {string} gameId
 * @param {string} kidId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const startGameSession = async (gameId, kidId, userId) => {
  try {
    if (!kidId || !gameId) {
      throw new Error("kid_id and game_id are required");
    }

    const { data: kid, error: kidError } = await supabase
      .from("kid_profile")
      .select("kid_id, user_id")
      .eq("kid_id", kidId)
      .single();

    if (kidError || !kid) {
      throw new Error("Kid profile not found");
    }

    if (userId && kid.user_id !== userId) {
      throw new Error("Unauthorized to start game for this kid");
    }

    const startTime = new Date().toISOString();
    const playDate = startTime.split("T")[0];

    const { data: existing, error: existingError } = await supabase
      .from("kid_game")
      .select("game_id, kid_id, play_date, attempts, score")
      .eq("game_id", gameId)
      .eq("kid_id", kidId)
      .eq("play_date", playDate)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to fetch existing game session: ${existingError.message}`);
    }

    const { data, error } = await supabase
      .from("kid_game")
      .upsert({
        game_id: gameId,
        kid_id: kidId,
        play_date: playDate,
        attempts: existing?.attempts || 0,
        score: existing?.score || 0,
        start_time: startTime,
        end_time: null,
      }, { onConflict: "game_id,kid_id,play_date" })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start game session: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Record game play and update kid progress
 * @param {string} gameId
 * @param {string} kidId
 * @param {number} score
 * @param {number} attempts
 * @param {string} userId
 * @returns {Promise<object>}
 */
const submitGameResult = async (gameId, kidId, score = 0, attempts = 1, userId) => {
  try {
    const { data: kid, error: kidError } = await supabase
      .from("kid_profile")
      .select("kid_id, user_id")
      .eq("kid_id", kidId)
      .single();

    if (kidError || !kid) {
      throw new Error("Kid profile not found");
    }

    if (userId && kid.user_id !== userId) {
      throw new Error("Unauthorized to submit game result for this kid");
    }

    const playDate = new Date().toISOString().split('T')[0];
    const normalizedScore = Number(score) || 0;
    const normalizedAttempts = Number(attempts) > 0 ? Number(attempts) : 1;

    // Check for any prior completed play ever (across all dates) to guard progress update
    const { data: anyPriorPlay, error: priorPlayError } = await supabase
      .from("kid_game")
      .select("game_id")
      .eq("game_id", gameId)
      .eq("kid_id", kidId)
      .not("end_time", "is", null)
      .limit(1)
      .maybeSingle();

    if (priorPlayError) {
      throw new Error(`Failed to check prior game plays: ${priorPlayError.message}`);
    }

    const isFirstPlay = !anyPriorPlay;

    const { data: existing, error: existingError } = await supabase
      .from("kid_game")
      .select("game_id, kid_id, play_date, attempts, score, start_time")
      .eq("game_id", gameId)
      .eq("kid_id", kidId)
      .eq("play_date", playDate)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to fetch existing game session: ${existingError.message}`);
    }

    const startTime = existing?.start_time || new Date().toISOString();
    const endTime = new Date().toISOString();

    const { data, error } = await supabase
      .from("kid_game")
      .upsert({
        game_id: gameId,
        kid_id: kidId,
        play_date: playDate,
        attempts: (existing?.attempts || 0) + normalizedAttempts,
        score: Math.max(Number(existing?.score || 0), normalizedScore),
        start_time: startTime,
        end_time: endTime,
      }, { onConflict: "game_id,kid_id,play_date" })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to submit game result: ${error.message}`);
    }

    const { data: currentProgress, error: progressFetchError } = await supabase
      .from("progress")
      .select("progress_id, total_quizzes, total_games, score, total_time")
      .eq("kid_id", kidId)
      .maybeSingle();

    if (progressFetchError) {
      throw new Error(`Failed to fetch progress: ${progressFetchError.message}`);
    }

    const recalculatedTotalTimeSeconds = await calculateTotalTimeForKid(kidId);
    const recalculatedTotalTime = formatSecondsToPgTime(recalculatedTotalTimeSeconds);
    const progressId = currentProgress?.progress_id || `PROG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { error: progressError } = await supabase
      .from("progress")
      .upsert({
        progress_id: progressId,
        kid_id: kidId,
        total_quizzes: currentProgress?.total_quizzes || 0,
        total_games: (currentProgress?.total_games || 0) + (isFirstPlay ? 1 : 0),
        score: Number(currentProgress?.score || 0) + (isFirstPlay ? normalizedScore : 0),
        total_time: recalculatedTotalTime,
        last_updated: new Date().toISOString(),
      }, { onConflict: "progress_id" });

    if (progressError) {
      throw new Error(`Failed to update progress after game: ${progressError.message}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export { getGames, getGameById, addGame, updateGame, deleteGame, startGameSession, submitGameResult };
