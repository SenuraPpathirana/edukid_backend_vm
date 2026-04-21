import * as materialsService from "./materials.service.js";
import { supabase } from "../../config/supabase.js";

const STORAGE_BUCKET = process.env.SUPABASE_MATERIALS_BUCKET || "learning_materials";

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

/**
 * Get all learning materials
 * GET /api/materials
 */
const getMaterials = async (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      grade: req.query.grade,
      subject: req.query.subject,
      language: req.query.language,
    };

    const materials = await materialsService.getMaterials(filters);

    res.status(200).json({
      message: "Materials retrieved successfully",
      materials,
    });
  } catch (error) {
    console.error("Get materials error:", error);
    res.status(500).json({
      message: "Failed to retrieve materials",
      error: error.message,
    });
  }
};

/**
 * Get single material by ID
 * GET /api/materials/:id
 */
const getMaterialById = async (req, res) => {
  try {
    const { id } = req.params;

    const material = await materialsService.getMaterialById(id);

    if (!material) {
      return res.status(404).json({
        message: "Material not found",
      });
    }

    res.status(200).json({
      message: "Material retrieved successfully",
      material,
    });
  } catch (error) {
    console.error("Get material by ID error:", error);
    res.status(500).json({
      message: "Failed to retrieve material",
      error: error.message,
    });
  }
};

/**
 * Upload new learning material
 * POST /api/materials
 */
const uploadMaterial = async (req, res) => {
  try {
    const { title, description, type, file_url, grade, subject, language, access_level } = req.body;
    const { user_id } = req.user;

    console.log('📄 Uploading material:', { title, type, grade, subject, language, access_level });

    if (!title || !description || !file_url) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title, description, and file URL are required" });
    }

    const materialData = {
      title,
      description,
      type,
      file_url,
      grade,
      subject,
      language,
      access_level,
      uploaded_by: user_id,
    };

    const material = await materialsService.uploadMaterial(materialData);

    console.log('✅ Material uploaded successfully:', material.material_id);

    res.status(201).json({
      message: "Material uploaded successfully",
      material,
    });
  } catch (error) {
    console.error("❌ Upload material error:", error);
    res.status(500).json({
      message: "Failed to upload material",
      error: error.message,
    });
  }
};

/**
 * Upload material file to Supabase storage via backend
 * POST /api/materials/upload-file
 */
const uploadMaterialFile = async (req, res) => {
  try {
    const file = req.file;
    const { preferredName } = req.body || {};
    const userId = req.user?.user_id || "admin";

    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    const allowedExtensions = ["pdf", "docx", "pptx", "zip"];
    const extension = getFileExtension(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      return res.status(400).json({ message: "Invalid file type. Allowed: PDF, DOCX, PPTX, ZIP" });
    }

    const safeOwner = sanitizePathSegment(userId) || "admin";
    const safeName = sanitizePathSegment(preferredName || file.originalname.replace(/\.[^/.]+$/, "")) || "material";
    const objectPath = `${safeOwner}/materials/${Date.now()}-${safeName}.${extension}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      console.error("❌ Storage upload failed:", error);
      return res.status(500).json({ message: error.message || "Failed to upload file to storage" });
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return res.status(201).json({
      message: "File uploaded successfully",
      bucket: STORAGE_BUCKET,
      path: objectPath,
      file_url: data.publicUrl,
    });
  } catch (error) {
    console.error("❌ Upload material file error:", error);
    return res.status(500).json({ message: "Failed to upload file", error: error.message });
  }
};

/**
 * Update a learning material
 * PUT /api/materials/:id
 */
const updateMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, file_url, grade, subject, language, access_level } = req.body;

    console.log('📝 Updating material:', { id, title, type, grade, subject, language, access_level });

    if (!title || !description || !file_url) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({ message: "Title, description, and file URL are required" });
    }

    const materialData = {
      title,
      description,
      type,
      file_url,
      grade,
      subject,
      language,
      access_level,
    };

    const material = await materialsService.updateMaterial(id, materialData);

    console.log('✅ Material updated successfully:', id);

    res.status(200).json({
      message: "Material updated successfully",
      material,
    });
  } catch (error) {
    console.error("❌ Update material error:", error);
    res.status(500).json({
      message: "Failed to update material",
      error: error.message,
    });
  }
};

/**
 * Delete a learning material
 * DELETE /api/materials/:id
 */
const deleteMaterial = async (req, res) => {
  try {
    const { id } = req.params;

    await materialsService.deleteMaterial(id);

    res.status(200).json({
      message: "Material deleted successfully",
    });
  } catch (error) {
    console.error("Delete material error:", error);
    res.status(500).json({
      message: "Failed to delete material",
      error: error.message,
    });
  }
};

/**
 * Record learning material access
 * POST /api/materials/:id/access
 */
const recordMaterialAccess = async (req, res) => {
  try {
    const { id: materialId } = req.params;
    const { kid_id, completion_status = "Completed", score = 10 } = req.body;

    if (!kid_id) {
      return res.status(400).json({ message: "kid_id is required" });
    }

    const result = await materialsService.recordMaterialAccess(
      materialId,
      kid_id,
      completion_status,
      score,
      req.user?.user_id
    );

    res.status(201).json({
      message: "Material access recorded successfully",
      result,
    });
  } catch (error) {
    console.error("Record material access error:", error);
    res.status(500).json({
      message: "Failed to record material access",
      error: error.message,
    });
  }
};

export { getMaterials, getMaterialById, uploadMaterialFile, uploadMaterial, updateMaterial, deleteMaterial, recordMaterialAccess };
