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
 * Get all quizzes
 * @param {object} filters - Optional filters (grade, subject)
 * @returns {Promise<Array>} Array of quizzes
 */
const getQuizzes = async (filters = {}, kidId = null) => {
  try {
    console.log('🔍 Quiz service - filters:', JSON.stringify(filters), 'kidId:', kidId);
    
    let query = supabase
      .from("quiz")
      .select("*")
      .order("uploaded_date", { ascending: false });

    if (filters.grade) {
      const gradeVariants = buildGradeVariants(filters.grade);
      console.log('📊 Grade variants for', filters.grade, ':', gradeVariants);
      query = gradeVariants.length > 1
        ? query.in("grade", gradeVariants)
        : query.eq("grade", gradeVariants[0]);
    }
    if (filters.subject) {
      console.log('📚 Filtering by subject:', filters.subject);
      query = query.eq("subject", filters.subject);
    }
    if (filters.language) {
      console.log('🌐 Filtering by language (ilike):', filters.language);
      query = query.ilike("language", filters.language);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch quizzes: ${error.message}`);

    console.log('✅ Quiz query returned', (data || []).length, 'results');
    if (data && data.length > 0) {
      console.log('📋 Sample quiz:', JSON.stringify(data[0]));
    }

    let quizzes = data || [];

    // If kidId provided, merge completion_status from kid_quiz
    if (kidId && quizzes.length > 0) {
      const quizIds = quizzes.map((q) => q.quiz_id);
      const { data: kidQuizRows, error: kidQuizError } = await supabase
        .from("kid_quiz")
        .select("quiz_id, completion_status")
        .eq("kid_id", kidId)
        .in("quiz_id", quizIds);

      if (kidQuizError) {
        throw new Error(`Failed to fetch kid quiz statuses: ${kidQuizError.message}`);
      }

      const statusMap = {};
      (kidQuizRows || []).forEach((row) => {
        statusMap[row.quiz_id] = typeof row.completion_status === "string"
          ? row.completion_status.trim()
          : row.completion_status;
      });

      quizzes = quizzes.map((q) => ({
        ...q,
        completion_status: statusMap[q.quiz_id] || null,
        is_completed: ((statusMap[q.quiz_id] || "").toLowerCase() === "completed"),
      }));
    }

    return quizzes;
  } catch (error) {
    throw error;
  }
};

/**
 * Create new quiz with questions and answers
 * @param {object} quizData - Quiz information
 * @param {Array} questions - Array of questions with answers
 * @returns {Promise<object>} Created quiz
 */
const createQuiz = async (quizData, questions = []) => {
  try {
    const quiz_id = `QUIZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. Insert quiz
    const { data: quiz, error: quizError } = await supabase
      .from("quiz")
      .insert([{
        quiz_id: quiz_id,
        title: quizData.title,
        subject: quizData.subject || "General",
        grade: quizData.grade,
        language: quizData.language,
        access_type: quizData.access_level === "premium" ? "Premium" : "Free",
        score: 0, // Initial score is 0
        uploaded_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      }])
      .select()
      .single();

    if (quizError) throw new Error(`Failed to create quiz: ${quizError.message}`);

    // 2. Insert questions and answers if provided
    let insertedQuestionCount = 0;
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const question_id = `${quiz_id}-Q${i + 1}`;

        // Insert question
        const { error: questionError } = await supabase
          .from("question")
          .insert([{
            question_id: question_id,
            quiz_id: quiz_id,
            question_text: question.text || question.question_text,
          }]);

        if (questionError) {
          console.error(`Failed to insert question ${i + 1}:`, questionError);
          continue; // Skip this question but continue with others
        }

        insertedQuestionCount++;

        // Insert answers for this question
        if (question.answers && question.answers.length > 0) {
          const answersToInsert = question.answers.map((answer, j) => ({
            option_id: `${question_id}-A${j + 1}`,
            question_id: question_id,
            option_text: answer.text || answer.option_text,
            correct_option: answer.isCorrect || answer.correct_option || false,
            option_count: 0, // Initial count
          }));

          const { error: answersError } = await supabase
            .from("answer")
            .insert(answersToInsert);

          if (answersError) {
            console.error(`Failed to insert answers for question ${i + 1}:`, answersError);
          }
        }
      }
    }

    // 3. Update quiz score to reflect the max achievable score (1 point per question)
    if (insertedQuestionCount > 0) {
      await supabase
        .from("quiz")
        .update({ score: insertedQuestionCount })
        .eq("quiz_id", quiz_id);
    }

    return quiz;
  } catch (error) {
    throw error;
  }
};

/**
 * Update a quiz with questions and answers
 * @param {string} quizId - Quiz ID
 * @param {object} quizData - Quiz information to update
 * @param {Array} questions - Array of questions with answers (optional)
 * @returns {Promise<object>} Updated quiz
 */
const updateQuiz = async (quizId, quizData, questions = null) => {
  try {
    // 1. Update quiz
    const { data: quiz, error: quizError } = await supabase
      .from("quiz")
      .update({
        title: quizData.title,
        score: quizData.score, // Use score field directly
        subject: quizData.subject || "General",
        grade: quizData.grade,
        language: quizData.language,
        access_type: quizData.access_level === "premium" ? "Premium" : "Free",
      })
      .eq("quiz_id", quizId)
      .select()
      .single();

    if (quizError) throw new Error(`Failed to update quiz: ${quizError.message}`);

    // 2. If questions are provided, delete old questions and insert new ones
    if (questions && questions.length > 0) {
      // Delete old questions (cascade will delete answers)
      const { error: deleteQuestionsError } = await supabase
        .from("question")
        .delete()
        .eq("quiz_id", quizId);

      if (deleteQuestionsError) {
        console.error('Failed to delete old questions:', deleteQuestionsError);
      }

      // Insert new questions and answers
      let insertedQuestionCount = 0;
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const question_id = `${quizId}-Q${i + 1}`;

        // Insert question
        const { error: questionError } = await supabase
          .from("question")
          .insert([{
            question_id: question_id,
            quiz_id: quizId,
            question_text: question.text || question.question_text,
          }]);

        if (questionError) {
          console.error(`Failed to insert question ${i + 1}:`, questionError);
          continue;
        }

        insertedQuestionCount++;

        // Insert answers for this question
        if (question.answers && question.answers.length > 0) {
          const answersToInsert = question.answers.map((answer, j) => ({
            option_id: `${question_id}-A${j + 1}`,
            question_id: question_id,
            option_text: answer.text || answer.option_text,
            correct_option: answer.isCorrect || answer.correct_option || false,
            option_count: 0,
          }));

          const { error: answersError } = await supabase
            .from("answer")
            .insert(answersToInsert);

          if (answersError) {
            console.error(`Failed to insert answers for question ${i + 1}:`, answersError);
          }
        }
      }

      // Update quiz score to reflect the max achievable score (if not manually set)
      if (insertedQuestionCount > 0 && !quizData.score) {
        await supabase
          .from("quiz")
          .update({ score: insertedQuestionCount })
          .eq("quiz_id", quizId);
      }
    }

    return quiz;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete a quiz
 * @param {string} quizId - Quiz ID
 * @returns {Promise<void>}
 */
const deleteQuiz = async (quizId) => {
  try {
    const { error } = await supabase
      .from("quiz")
      .delete()
      .eq("quiz_id", quizId);

    if (error) throw new Error(`Failed to delete quiz: ${error.message}`);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Get quiz with questions and answers
 * @param {string} quizId - Quiz ID
 * @returns {Promise<object>} Quiz with questions and answers
 */
const getQuizWithQuestions = async (quizId) => {
  try {
    // Get quiz info
    const { data: quiz, error: quizError } = await supabase
      .from("quiz")
      .select("*")
      .eq("quiz_id", quizId)
      .single();

    if (quizError) throw new Error(`Failed to fetch quiz: ${quizError.message}`);
    if (!quiz) throw new Error("Quiz not found");

    // Get questions for this quiz
    const { data: questions, error: questionsError } = await supabase
      .from("question")
      .select("*")
      .eq("quiz_id", quizId)
      .order("question_id", { ascending: true });

    if (questionsError) throw new Error(`Failed to fetch questions: ${questionsError.message}`);

    // Get answers for each question
    const questionsWithAnswers = await Promise.all(
      (questions || []).map(async (question) => {
        const { data: answers, error: answersError } = await supabase
          .from("answer")
          .select("*")
          .eq("question_id", question.question_id)
          .order("option_id", { ascending: true });

        if (answersError) {
          console.error(`Failed to fetch answers for question ${question.question_id}:`, answersError);
          return { ...question, answers: [] };
        }

        return {
          ...question,
          answers: answers || [],
        };
      })
    );

    return {
      ...quiz,
      questions: questionsWithAnswers,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Start quiz session (records start_time)
 * @param {string} kidId - Kid ID
 * @param {string} quizId - Quiz ID
 * @param {string} userId - User ID from token
 * @returns {Promise<object>} kid_quiz row
 */
const startQuizSession = async (kidId, quizId, userId) => {
  try {
    if (!kidId || !quizId) {
      throw new Error("kid_id and quiz_id are required");
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
      throw new Error("Unauthorized to start quiz for this kid");
    }

    const { data: existing, error: existingError } = await supabase
      .from("kid_quiz")
      .select("quiz_id, kid_id, attempt_count, score, completion_status")
      .eq("quiz_id", quizId)
      .eq("kid_id", kidId)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to fetch existing quiz session: ${existingError.message}`);
    }

    const preservedStatus = (existing?.completion_status || "").toLowerCase() === "completed"
      ? "Completed"
      : "In Progress";

    const { data, error } = await supabase
      .from("kid_quiz")
      .upsert({
        quiz_id: quizId,
        kid_id: kidId,
        attempt_count: existing?.attempt_count || 0,
        score: existing?.score || 0,
        completion_status: preservedStatus,
        start_time: new Date().toISOString(),
        end_time: null,
      }, { onConflict: "quiz_id,kid_id" })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start quiz session: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Submit quiz result (record kid's quiz attempt)
 * @param {string} kidId - Kid ID
 * @param {string} quizId - Quiz ID
 * @param {number} score - Score achieved
 * @param {number} totalQuestions - Total questions in quiz
 * @returns {Promise<object>} Created kid_quiz record
 */
const submitQuizResult = async (kidId, quizId, score, totalQuestions, userId) => {
  try {
    if (!kidId || !quizId) {
      throw new Error("kid_id and quiz_id are required");
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
      throw new Error("Unauthorized to submit quiz result for this kid");
    }

    const today = new Date().toISOString().split('T')[0];
    const normalizedScore = Number(score) || 0;

    const { data: existing, error: existingError } = await supabase
      .from("kid_quiz")
      .select("quiz_id, kid_id, attempt_count, start_time")
      .eq("quiz_id", quizId)
      .eq("kid_id", kidId)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to fetch existing quiz attempt: ${existingError.message}`);
    }

    // First attempt = no prior record OR attempt_count was 0
    const isFirstAttempt = !existing || (existing.attempt_count || 0) === 0;
    const nextAttemptCount = (existing?.attempt_count || 0) + 1;

    const startTime = existing?.start_time || new Date().toISOString();
    const endTime = new Date().toISOString();

    const { data, error } = await supabase
      .from("kid_quiz")
      .upsert({
        quiz_id: quizId,
        kid_id: kidId,
        attempt_count: nextAttemptCount,
        score: normalizedScore,
        completion_status: "Completed",
        start_time: startTime,
        end_time: endTime,
      }, { onConflict: "quiz_id,kid_id" })
      .select()
      .single();

    if (error) throw new Error(`Failed to submit quiz result: ${error.message}`);

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
        total_quizzes: (currentProgress?.total_quizzes || 0) + (isFirstAttempt ? 1 : 0),
        total_games: currentProgress?.total_games || 0,
        score: Number(currentProgress?.score || 0) + (isFirstAttempt ? normalizedScore : 0),
        total_time: recalculatedTotalTime,
        last_updated: new Date().toISOString(),
      }, { onConflict: "progress_id" });

    if (progressError) {
      throw new Error(`Failed to update progress after quiz: ${progressError.message}`);
    }

    console.log('✅ Quiz result submitted:', {
      kidId,
      quizId,
      score: normalizedScore,
      totalQuestions,
      attemptCount: nextAttemptCount,
      date: today,
    });

    return data;
  } catch (error) {
    throw error;
  }
};

export { getQuizzes, createQuiz, updateQuiz, deleteQuiz, getQuizWithQuestions, startQuizSession, submitQuizResult };
