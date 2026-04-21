import express from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  getKidProgress,
  getUserKidsProgress,
  upsertProgress,
  updateProgressStats,
  getLeaderboard,
} from "./progress.controller.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get progress for all kids of logged-in user
router.get("/", getUserKidsProgress);

// Get leaderboard
router.get("/leaderboard", getLeaderboard);

// Get progress for specific kid
router.get("/:kid_id", getKidProgress);

// Create or update progress
router.post("/", upsertProgress);

// Update progress stats (increment)
router.patch("/:kid_id/stats", updateProgressStats);

export default router;
