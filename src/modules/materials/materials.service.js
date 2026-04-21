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

/**
 * Get single material by ID
 * @param {string} materialId - Material ID
 * @returns {Promise<object>} Material
 */
const getMaterialById = async (materialId) => {
  try {
    const { data, error } = await supabase
      .from("learning_materials")
      .select("*")
      .eq("material_id", materialId)
      .single();

    if (error) throw new Error(`Failed to fetch material: ${error.message}`);

    if (!data) return null;

    // Transform to match frontend expectations
    return {
      material_id: data.material_id,
      title: data.title,
      description: data.description,
      subject: data.subject || 'General',
      grade: data.grade,
      language: data.language,
      access_type: data.access_type || 'Free',
      type: data.file_url?.split('.').pop()?.toUpperCase() || 'PDF',
      downloads: 0,
      uploaded_at: data.uploaded_date,
      file_url: data.file_url,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get all learning materials
 * @param {object} filters - Optional filters (type, grade, subject)
 * @returns {Promise<Array>} Array of materials
 */
const getMaterials = async (filters = {}) => {
  try {
    let query = supabase
      .from("learning_materials")
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

    if (error) throw new Error(`Failed to fetch materials: ${error.message}`);

    // Transform to match frontend expectations
    const materials = (data || []).map(mat => ({
      material_id: mat.material_id,
      title: mat.title,
      description: mat.description,
      subject: mat.subject || 'General',
      grade: mat.grade,
      language: mat.language,
      access_type: mat.access_type || 'Free',
      type: mat.file_url?.split('.').pop()?.toUpperCase() || 'PDF',
      downloads: 0, // Not tracked in current schema
      uploaded_at: mat.uploaded_date,
      file_url: mat.file_url,
    }));

    return materials;
  } catch (error) {
    throw error;
  }
};

/**
 * Upload new learning material
 * @param {object} materialData - Material information
 * @returns {Promise<object>} Created material
 */
const uploadMaterial = async (materialData) => {
  try {
    const material_id = `MAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from("learning_materials")
      .insert([{
        material_id: material_id,
        title: materialData.title,
        description: materialData.description,
        subject: materialData.subject || "General",
        grade: materialData.grade,
        language: materialData.language || "English",
        access_type: materialData.access_level === "premium" ? "Premium" : (materialData.access_level === "free" ? "Free" : (materialData.access_level || "Free")),
        file_url: materialData.file_url,
        uploaded_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      }])
      .select()
      .single();

    if (error) throw new Error(`Failed to upload material: ${error.message}`);

    return {
      material_id: data.material_id,
      title: data.title,
      description: data.description,
      type: materialData.type,
      downloads: 0,
      uploaded_at: data.uploaded_date,
      file_url: data.file_url,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update a learning material
 * @param {string} materialId - Material ID
 * @param {object} materialData - Material information to update
 * @returns {Promise<object>} Updated material
 */
const updateMaterial = async (materialId, materialData) => {
  try {
    const { data, error } = await supabase
      .from("learning_materials")
      .update({
        title: materialData.title,
        description: materialData.description,
        subject: materialData.subject || "General",
        grade: materialData.grade,
        language: materialData.language || "English",
        access_type: materialData.access_level === "premium" ? "Premium" : (materialData.access_level === "free" ? "Free" : (materialData.access_level || "Free")),
        file_url: materialData.file_url,
      })
      .eq("material_id", materialId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update material: ${error.message}`);

    return {
      material_id: data.material_id,
      title: data.title,
      description: data.description,
      type: materialData.type,
      downloads: 0,
      uploaded_at: data.uploaded_date,
      file_url: data.file_url,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Delete a learning material
 * @param {string} materialId - Material ID
 * @returns {Promise<void>}
 */
const deleteMaterial = async (materialId) => {
  try {
    const { error } = await supabase
      .from("learning_materials")
      .delete()
      .eq("material_id", materialId);

    if (error) throw new Error(`Failed to delete material: ${error.message}`);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Record learning material access for a kid and update progress score
 * @param {string} materialId
 * @param {string} kidId
 * @param {string} completionStatus
 * @param {number} score
 * @param {string} userId
 * @returns {Promise<object>}
 */
const recordMaterialAccess = async (
  materialId,
  kidId,
  completionStatus = "Completed",
  score = 10,
  userId
) => {
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
      throw new Error("Unauthorized to track material access for this kid");
    }

    const accessDate = new Date().toISOString().split('T')[0];
    const allowedStatuses = ["Completed", "Started", "Not Started"];
    const normalizedStatus = allowedStatuses.includes(completionStatus)
      ? completionStatus
      : "Completed";

    const { data, error } = await supabase
      .from("kid_learning_materials")
      .upsert({
        material_id: materialId,
        kid_id: kidId,
        access_date: accessDate,
        completion_status: normalizedStatus,
      }, { onConflict: "material_id,kid_id,access_date" })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record material access: ${error.message}`);
    }

    const scoreGain = normalizedStatus === "Completed" ? Number(score) || 0 : 0;
    if (scoreGain > 0) {
      const { data: currentProgress, error: progressFetchError } = await supabase
        .from("progress")
        .select("progress_id, total_quizzes, total_games, score")
        .eq("kid_id", kidId)
        .maybeSingle();

      if (progressFetchError) {
        throw new Error(`Failed to fetch progress: ${progressFetchError.message}`);
      }

      const progressId = currentProgress?.progress_id || `PROG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { error: progressError } = await supabase
        .from("progress")
        .upsert({
          progress_id: progressId,
          kid_id: kidId,
          total_quizzes: currentProgress?.total_quizzes || 0,
          total_games: currentProgress?.total_games || 0,
          score: Number(currentProgress?.score || 0) + scoreGain,
          last_updated: new Date().toISOString(),
        }, { onConflict: "progress_id" });

      if (progressError) {
        throw new Error(`Failed to update progress after material access: ${progressError.message}`);
      }
    }

    return data;
  } catch (error) {
    throw error;
  }
};

export { getMaterials, getMaterialById, uploadMaterial, updateMaterial, deleteMaterial, recordMaterialAccess };
