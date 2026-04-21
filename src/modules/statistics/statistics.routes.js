import express from "express";
import * as statisticsController from "./statistics.controller.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// All statistics routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get("/dashboard", statisticsController.getDashboardStats);

// Get recent activities
router.get("/activities", statisticsController.getRecentActivities);

export default router;
