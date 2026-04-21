import express from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  getUserSubscriptions,
  getActiveSubscription,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  processPayment,
  getSubscriptionStats,
  initiatePayHerePayment,
  payHereNotify,
  confirmPaymentBypass,
  getSubscriptionKids,
  updateSubscriptionKids,
} from "./subscriptions.controller.js";

const router = express.Router();

// ─── PayHere notify webhook — PUBLIC (no auth, called by PayHere servers) ───
router.post("/payhere/notify", payHereNotify);

// All routes below require authentication
router.use(authenticate);

// PayHere: initiate payment (authenticated user)
router.post("/payhere/initiate", initiatePayHerePayment);

// Bypass payment confirmation (test mode — marks subscription as Paid)
router.post("/bypass-payment", confirmPaymentBypass);

// Get all subscriptions for user
router.get("/", getUserSubscriptions);

// Get active subscription
router.get("/active", getActiveSubscription);

// Get subscription statistics (admin only)
router.get("/stats", getSubscriptionStats);

// Get specific subscription
router.get("/:subscription_id", getSubscriptionById);

// Get kids linked to a subscription
router.get("/:subscription_id/kids", getSubscriptionKids);

// Create new subscription
router.post("/", createSubscription);

// Process payment
router.post("/payment", processPayment);

// Update subscription
router.patch("/:subscription_id", updateSubscription);

// Update kids linked to a subscription (1-5 kids)
router.put("/:subscription_id/kids", updateSubscriptionKids);

// Cancel subscription
router.delete("/:subscription_id", cancelSubscription);

// Cancel subscription via POST (supports body with reason + kid_ids)
router.post("/:subscription_id/cancel", cancelSubscription);

export default router;
