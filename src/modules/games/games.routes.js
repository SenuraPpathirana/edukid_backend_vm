import express from "express";
import multer from "multer";
import * as gamesController from "./games.controller.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 },
});

// All games routes require authentication
router.use(authenticate);

// Get all games
router.get("/", gamesController.getGames);

// Get single game by ID
router.get("/:id", gamesController.getGameById);

// Start game session
router.post("/:id/start", gamesController.startGameSession);

// Record game play result
router.post("/:id/play", gamesController.submitGameResult);

// Upload game package file to storage
router.post("/upload-file", upload.single("file"), gamesController.uploadGameFile);

// Add new game
router.post("/", gamesController.addGame);

// Update a game
router.put("/:id", gamesController.updateGame);

// Delete a game
router.delete("/:id", gamesController.deleteGame);

export default router;
