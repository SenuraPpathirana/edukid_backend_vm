import * as gamesService from "./games.service.js";
import { supabase } from "../../config/supabase.js";

const STORAGE_BUCKET = process.env.SUPABASE_GAMES_BUCKET || "learning_games";

const sanitizePathSegment = (value = "") => {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const getFileExtension = (fileName = "") => {
  const parts = String(fileName).split(".");
  return parts.length > 1 ? parts.pop() || "bin" : "bin";
};

const getContentTypeByExtension = (extension = "") => {
  const normalized = String(extension).toLowerCase();
  if (normalized === "html" || normalized === "htm") return "text/html; charset=utf-8";
  if (normalized === "zip") return "application/zip";
  if (normalized === "rar") return "application/vnd.rar";
  return "application/octet-stream";
};

/**
 * Get all games
 * GET /api/games
 */
const getGames = async (req, res) => {
  try {
    const filters = {
      grade: req.query.grade,
      subject: req.query.subject,
      difficulty: req.query.difficulty,
      language: req.query.language,
    };

    const games = await gamesService.getGames(filters);

    res.status(200).json({
      message: "Games retrieved successfully",
      games,
    });
  } catch (error) {
    console.error("Get games error:", error);
    res.status(500).json({
      message: "Failed to retrieve games",
      error: error.message,
    });
  }
};

/**
 * Get single game by ID
 * GET /api/games/:id
 */
const getGameById = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await gamesService.getGameById(id);

    if (!game) {
      return res.status(404).json({
        message: "Game not found",
      });
    }

    res.status(200).json({
      message: "Game retrieved successfully",
      game,
    });
  } catch (error) {
    console.error("Get game by ID error:", error);
    res.status(500).json({
      message: "Failed to retrieve game",
      error: error.message,
    });
  }
};

/**
 * Add new game
 * POST /api/games
 */
const addGame = async (req, res) => {
  try {
    const { title, description, time_limit, maximum_score, difficulty_level, grade, subject, access_level, language, game_url } = req.body;
    const { user_id } = req.user;

    console.log('🎮 Adding game:', { title, grade, subject, language, access_level });

    if (!title || !description || !game_url) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title, description, and game URL are required" });
    }

    const gameData = {
      title,
      description,
      time_limit: parseInt(time_limit),
      maximum_score: parseInt(maximum_score),
      difficulty_level,
      grade,
      subject,
      access_level,
      language,
      game_url,
      created_by: user_id,
    };

    const game = await gamesService.addGame(gameData);

    console.log('✅ Game added successfully:', game.game_id);

    res.status(201).json({
      message: "Game added successfully",
      game,
    });
  } catch (error) {
    console.error("❌ Add game error:", error);
    res.status(500).json({
      message: "Failed to add game",
      error: error.message,
    });
  }
};

/**
 * Upload game package file to Supabase storage via backend
 * POST /api/games/upload-file
 */
const uploadGameFile = async (req, res) => {
  try {
    const file = req.file;
    const { preferredName } = req.body || {};
    const userId = req.user?.user_id || "admin";

    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    const allowedExtensions = ["zip", "rar", "html", "htm"];
    const extension = getFileExtension(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      return res.status(400).json({ message: "Invalid file type. Allowed: ZIP, RAR, HTML, HTM" });
    }

    const safeOwner = sanitizePathSegment(userId) || "admin";
    const safeName = sanitizePathSegment(preferredName || file.originalname.replace(/\.[^/.]+$/, "")) || "game-package";
    const objectPath = `${safeOwner}/games/${Date.now()}-${safeName}.${extension}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: getContentTypeByExtension(extension),
        upsert: false,
      });

    if (error) {
      console.error("❌ Game storage upload failed:", error);
      return res.status(500).json({ message: error.message || "Failed to upload game file to storage" });
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return res.status(201).json({
      message: "Game file uploaded successfully",
      bucket: STORAGE_BUCKET,
      path: objectPath,
      file_url: data.publicUrl,
    });
  } catch (error) {
    console.error("❌ Upload game file error:", error);
    return res.status(500).json({ message: "Failed to upload game file", error: error.message });
  }
};

/**
 * Update a game
 * PUT /api/games/:id
 */
const updateGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, time_limit, maximum_score, difficulty_level, grade, subject, access_level, language, game_url } = req.body;

    console.log('🎮 Updating game:', { id, title, grade, subject, language, access_level });

    if (!title || !description || !game_url) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title, description, and game URL are required" });
    }

    const gameData = {
      title,
      description,
      time_limit: parseInt(time_limit),
      maximum_score: parseInt(maximum_score),
      difficulty_level,
      grade,
      subject,
      access_level,
      language,
      game_url,
    };

    const game = await gamesService.updateGame(id, gameData);

    console.log('✅ Game updated successfully:', id);

    res.status(200).json({
      message: "Game updated successfully",
      game,
    });
  } catch (error) {
    console.error("❌ Update game error:", error);
    res.status(500).json({
      message: "Failed to update game",
      error: error.message,
    });
  }
};

/**
 * Delete a game
 * DELETE /api/games/:id
 */
const deleteGame = async (req, res) => {
  try {
    const { id } = req.params;

    await gamesService.deleteGame(id);

    res.status(200).json({
      message: "Game deleted successfully",
    });
  } catch (error) {
    console.error("Delete game error:", error);
    res.status(500).json({
      message: "Failed to delete game",
      error: error.message,
    });
  }
};

/**
 * Start game session
 * POST /api/games/:id/start
 */
const startGameSession = async (req, res) => {
  try {
    const { id: gameId } = req.params;
    const { kid_id } = req.body;

    if (!kid_id) {
      return res.status(400).json({ message: "kid_id is required" });
    }

    const result = await gamesService.startGameSession(
      gameId,
      kid_id,
      req.user?.user_id
    );

    res.status(200).json({
      message: "Game session started",
      result,
    });
  } catch (error) {
    console.error("Start game session error:", error);
    res.status(500).json({
      message: "Failed to start game session",
      error: error.message,
    });
  }
};

/**
 * Record game play result
 * POST /api/games/:id/play
 */
const submitGameResult = async (req, res) => {
  try {
    const { id: gameId } = req.params;
    const { kid_id, score = 0, attempts = 1 } = req.body;

    if (!kid_id) {
      return res.status(400).json({ message: "kid_id is required" });
    }

    const result = await gamesService.submitGameResult(
      gameId,
      kid_id,
      score,
      attempts,
      req.user?.user_id
    );

    res.status(201).json({
      message: "Game play recorded successfully",
      result,
    });
  } catch (error) {
    console.error("Submit game result error:", error);
    res.status(500).json({
      message: "Failed to record game result",
      error: error.message,
    });
  }
};

export { getGames, getGameById, uploadGameFile, addGame, updateGame, deleteGame, startGameSession, submitGameResult };
