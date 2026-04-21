import * as quizzesService from "./quizzes.service.js";

/**
 * Get all quizzes
 * GET /api/quizzes
 */
const getQuizzes = async (req, res) => {
  try {
    const filters = {
      grade: req.query.grade,
      subject: req.query.subject,
      difficulty: req.query.difficulty,
      language: req.query.language,
    };
    const kidId = req.query.kid_id || null;

    console.log('🔍 Fetching quizzes with filters:', filters, 'kidId:', kidId);

    const quizzes = await quizzesService.getQuizzes(filters, kidId);
    
    console.log('✅ Found', quizzes.length, 'quizzes');

    res.status(200).json({
      message: "Quizzes retrieved successfully",
      quizzes,
    });
  } catch (error) {
    console.error("Get quizzes error:", error);
    res.status(500).json({
      message: "Failed to retrieve quizzes",
      error: error.message,
    });
  }
};

/**
 * Create new quiz
 * POST /api/quizzes
 */
const createQuiz = async (req, res) => {
  try {
    const { title, description, time_limit, passing_score, difficulty_level, grade, subject, access_level, language, questions } = req.body;
    const { user_id } = req.user;

    console.log('📚 Creating quiz:', { title, grade, subject, language, access_level, questionCount: questions?.length || 0 });

    if (!title || !description || !time_limit || !passing_score) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title, description, time limit, and passing score are required" });
    }

    const quizData = {
      title,
      description,
      time_limit: parseInt(time_limit),
      passing_score: parseInt(passing_score),
      difficulty_level,
      grade,
      subject,
      access_level,
      language,
      created_by: user_id,
    };

    const quiz = await quizzesService.createQuiz(quizData, questions);

    console.log('✅ Quiz created successfully:', quiz.quiz_id, `with ${questions?.length || 0} questions`);

    res.status(201).json({
      message: "Quiz created successfully",
      quiz,
    });
  } catch (error) {
    console.error("❌ Create quiz error:", error);
    res.status(500).json({
      message: "Failed to create quiz",
      error: error.message,
    });
  }
};

/**
 * Update a quiz
 * PUT /api/quizzes/:id
 */
const updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, passing_score, grade, subject, access_level, language, questions } = req.body;

    console.log('📚 Updating quiz:', { id, title, grade, subject, language, access_level, questionCount: questions?.length || 0 });

    if (!title || !passing_score) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title and passing score are required" });
    }

    const quizData = {
      title,
      score: parseInt(passing_score), // Map passing_score to score field
      grade,
      subject,
      access_level,
      language,
    };

    const quiz = await quizzesService.updateQuiz(id, quizData, questions);

    console.log('✅ Quiz updated successfully:', id, `with ${questions?.length || 0} questions`);

    res.status(200).json({
      message: "Quiz updated successfully",
      quiz,
    });
  } catch (error) {
    console.error("❌ Update quiz error:", error);
    res.status(500).json({
      message: "Failed to update quiz",
      error: error.message,
    });
  }
};

/**
 * Delete a quiz
 * DELETE /api/quizzes/:id
 */
const deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    await quizzesService.deleteQuiz(id);

    res.status(200).json({
      message: "Quiz deleted successfully",
    });
  } catch (error) {
    console.error("Delete quiz error:", error);
    res.status(500).json({
      message: "Failed to delete quiz",
      error: error.message,
    });
  }
};

/**
 * Get quiz with questions and answers
 * GET /api/quizzes/:id
 */
const getQuizWithQuestions = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await quizzesService.getQuizWithQuestions(id);

    res.status(200).json({
      message: "Quiz retrieved successfully",
      quiz,
    });
  } catch (error) {
    console.error("Get quiz error:", error);
    res.status(500).json({
      message: "Failed to retrieve quiz",
      error: error.message,
    });
  }
};

/**
 * Start quiz session
 * POST /api/quizzes/:id/start
 */
const startQuizSession = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { kid_id } = req.body;

    if (!kid_id) {
      return res.status(400).json({ message: "kid_id is required" });
    }

    const result = await quizzesService.startQuizSession(
      kid_id,
      quizId,
      req.user?.user_id
    );

    res.status(200).json({
      message: "Quiz session started",
      result,
    });
  } catch (error) {
    console.error("❌ Start quiz session error:", error);
    res.status(500).json({
      message: "Failed to start quiz session",
      error: error.message,
    });
  }
};

/**
 * Submit quiz result
 * POST /api/quizzes/:id/submit
 */
const submitQuizResult = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { kid_id, score, total_questions } = req.body;

    console.log('📊 Submitting quiz result:', { kid_id, quizId, score, total_questions });

    if (!kid_id || score === undefined || !total_questions) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "kid_id, score, and total_questions are required" });
    }

    const result = await quizzesService.submitQuizResult(
      kid_id,
      quizId,
      score,
      total_questions,
      req.user?.user_id
    );

    console.log('✅ Quiz result submitted successfully');
        const kidId = req.query.kid_id || null;

    res.status(201).json({
      message: "Quiz result submitted successfully",
      result,
    });
  } catch (error) {
    console.error("❌ Submit quiz result error:", error);
    res.status(500).json({
      message: "Failed to submit quiz result",
      error: error.message,
    });
  }
};

export { getQuizzes, createQuiz, updateQuiz, deleteQuiz, getQuizWithQuestions, startQuizSession, submitQuizResult };
