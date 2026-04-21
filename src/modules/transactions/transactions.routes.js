import express from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  getUserTransactions,
  getTransactionById,
  getSubscriptionTransactions,
  createTransaction,
  updateTransactionStatus,
  getTransactionStats,
  getRecentTransactions,
} from "./transactions.controller.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all transactions for user
router.get("/", getUserTransactions);

// Get recent transactions
router.get("/recent", getRecentTransactions);

// Get transaction statistics (admin only)
router.get("/stats", getTransactionStats);

// Get transactions for a subscription
router.get("/subscription/:subscription_id", getSubscriptionTransactions);

// Get specific transaction
router.get("/:transaction_id", getTransactionById);

// Create new transaction
router.post("/", createTransaction);

// Update transaction status
router.patch("/:transaction_id/status", updateTransactionStatus);

export default router;
