import express from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  generateReport,
  getReports,
  getReportById,
  deleteReport,
} from "./reports.controller.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Generate a new report
router.post("/generate", generateReport);

// Get all reports
router.get("/", getReports);

// Get specific report
router.get("/:report_id", getReportById);

// Delete report
router.delete("/:report_id", deleteReport);

export default router;
