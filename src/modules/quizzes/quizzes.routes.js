import express from "express";
import * as quizzesController from "./quizzes.controller.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// All quizzes routes require authentication
router.use(authenticate);

// Get all quizzes
router.get("/", quizzesController.getQuizzes);

// Get specific quiz with questions
router.get("/:id", quizzesController.getQuizWithQuestions);

// Start quiz session
router.post("/:id/start", quizzesController.startQuizSession);

// Submit quiz result
router.post("/:id/submit", quizzesController.submitQuizResult);

// Create new quiz
router.post("/", quizzesController.createQuiz);

// Update a quiz
router.put("/:id", quizzesController.updateQuiz);

// Delete a quiz
router.delete("/:id", quizzesController.deleteQuiz);

export default router;
