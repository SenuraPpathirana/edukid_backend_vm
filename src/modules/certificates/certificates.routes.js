import express from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  getUserCertificates,
  getKidCertificates,
  getCertificateById,
  issueCertificate,
  updateCertificateStatus,
  deleteCertificate,
  getSubjectEligibility,
} from "./certificates.controller.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all certificates for user's kids
router.get("/", getUserCertificates);

// Get certificates for specific kid
router.get("/kid/:kid_id", getKidCertificates);

// Get subject eligibility for a specific kid
router.get("/subject-eligibility/:kid_id", getSubjectEligibility);

// Get specific certificate
router.get("/:certificate_id", getCertificateById);

// Issue new certificate
router.post("/", issueCertificate);

// Update certificate status
router.patch("/:certificate_id/status", updateCertificateStatus);

// Revoke certificate
router.delete("/:certificate_id", deleteCertificate);

export default router;
