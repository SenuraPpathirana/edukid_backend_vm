import { supabase } from "../../config/supabase.js";
import { generatePayHereHash, verifyPayHereNotify } from "./payhere.helper.js";

// ─────────────────────────────────────────────
// PayHere: Initiate payment (returns params for JS SDK)
// POST /subscriptions/payhere/initiate
// ─────────────────────────────────────────────
export const initiatePayHerePayment = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    const { billing_period, total_amount, kid_ids, first_name, last_name, email, phone } = req.body;

    if (!billing_period || !total_amount) {
      return res.status(400).json({ error: "billing_period and total_amount are required" });
    }

    // Validate kid_ids (1-5 kids required)
    if (!Array.isArray(kid_ids) || kid_ids.length < 1 || kid_ids.length > 5) {
      return res.status(400).json({ error: "You must select between 1 and 5 kid profiles" });
    }

    // Verify all kid_ids belong to this user
    const { data: kids, error: kidsErr } = await supabase
      .from("kid_profile")
      .select("kid_id")
      .in("kid_id", kid_ids)
      .eq("user_id", user_id);

    if (kidsErr) throw kidsErr;
    if (!kids || kids.length !== kid_ids.length) {
      return res.status(400).json({ error: "One or more kid profiles not found or do not belong to you" });
    }

    // Calculate renewal date
    const subscribed_date = new Date();
    let renewal_date = new Date(subscribed_date);
    switch (billing_period) {
      case "Daily":   renewal_date.setDate(renewal_date.getDate() + 1); break;
      case "Weekly":  renewal_date.setDate(renewal_date.getDate() + 7); break;
      case "Monthly": renewal_date.setMonth(renewal_date.getMonth() + 1); break;
      case "Yearly":  renewal_date.setFullYear(renewal_date.getFullYear() + 1); break;
      default: return res.status(400).json({ error: "Invalid billing_period" });
    }

    // Create a PENDING subscription row first so we have an order_id
    const subscription_id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { data: sub, error: subErr } = await supabase
      .from("subscription")
      .insert({
        subscription_id,
        user_id,
        total_amount: parseFloat(total_amount),
        billing_period,
        subscribed_date: subscribed_date.toISOString().split("T")[0],
        renewal_date: renewal_date.toISOString().split("T")[0],
        payment_status: "Pending",
        is_active: false,
      })
      .select()
      .single();

    if (subErr) throw subErr;

    // Link selected kid profiles to this subscription
    for (const kid_id of kid_ids) {
      const { error: linkErr } = await supabase
        .from("kid_profile")
        .update({ "subscription_ID": subscription_id })
        .eq("kid_id", kid_id)
        .eq("user_id", user_id);
      if (linkErr) throw linkErr;
    }

    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const currency = "LKR";
    const amount = parseFloat(total_amount).toFixed(2);
    const hash = generatePayHereHash(merchantId, subscription_id, amount, currency, merchantSecret);
    const isSandbox = process.env.PAYHERE_SANDBOX === "true";
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

    res.json({
      subscription_id,
      payhere: {
        sandbox: isSandbox,
        merchant_id: merchantId,
        order_id: subscription_id,
        amount,
        currency,
        hash,
        items: `EduKid ${billing_period} Premium`,
        first_name: first_name || "",
        last_name: last_name || "",
        email: email || "",
        phone: phone || "",
        notify_url: `${backendUrl}/api/subscriptions/payhere/notify`,
        return_url: `${process.env.FRONTEND_URL || "http://localhost:8080"}/payment-success`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:8080"}/payment`,
      },
    });
  } catch (error) {
    console.error("PayHere initiate error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// PayHere: Notify webhook (called by PayHere server-side)
// POST /subscriptions/payhere/notify  (no auth — public)
// ─────────────────────────────────────────────
export const payHereNotify = async (req, res) => {
  try {
    const {
      merchant_id, order_id, payhere_amount, payhere_currency,
      status_code, md5sig, payment_id, method,
    } = req.body;

    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const isValid = verifyPayHereNotify(merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig, merchantSecret);

    if (!isValid) {
      console.warn("⚠️  PayHere notify: invalid signature for order", order_id);
      return res.sendStatus(400);
    }

    // status_code 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback
    if (status_code !== "2") {
      console.log(`PayHere status ${status_code} for order ${order_id} — no action taken`);
      return res.sendStatus(200);
    }

    // Get pending subscription
    const { data: sub, error: subErr } = await supabase
      .from("subscription")
      .select("*")
      .eq("subscription_id", order_id)
      .single();

    if (subErr || !sub) {
      console.error("PayHere notify: subscription not found", order_id);
      return res.sendStatus(404);
    }

    // Update subscription → Paid + active
    await supabase
      .from("subscription")
      .update({ payment_status: "Paid", is_active: true })
      .eq("subscription_id", order_id);

    // Create transaction record
    const transaction_id = `txn_ph_${payment_id || Date.now()}`;
    await supabase.from("transaction").insert({
      transaction_id,
      subscription_id: order_id,
      amount: parseFloat(payhere_amount),
      method: method || "PayHere",
      transaction_date: new Date().toISOString().split("T")[0],
      status: "Success",
    });

    // Update user account_status → Paid
    await supabase.from("user").update({ account_status: "Paid" }).eq("user_id", sub.user_id);

    // Upgrade kid profiles linked to this subscription via subscription_ID FK
    const { error: kidErr } = await supabase
      .from("kid_profile")
      .update({ premium_status: "Premium" })
      .eq("subscription_ID", order_id);
    if (kidErr) console.error("Warning: could not upgrade kid profiles:", kidErr.message);

    console.log(`✅ PayHere payment confirmed for subscription ${order_id}`);
    res.sendStatus(200);
  } catch (error) {
    console.error("PayHere notify error:", error);
    res.sendStatus(500);
  }
};

// Get all subscriptions for a user
export const getUserSubscriptions = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("subscription")
      .select("*")
      .eq("user_id", user_id)
      .order("subscribed_date", { ascending: false });

    if (error) throw error;

    res.json({ subscriptions: data || [] });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get active subscription(s) with all premium kids
export const getActiveSubscription = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get all active subscriptions for the user
    const { data: subscriptions, error } = await supabase
      .from("subscription")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .order("subscribed_date", { ascending: false });

    if (error) {
      throw error;
    }

    // If no subscriptions, return empty
    if (!subscriptions || subscriptions.length === 0) {
      return res.json({ subscription: null, subscriptions: [], kids: [] });
    }

    // Get all premium kid profiles for this user (regardless of subscription_ID)
    const { data: allKids, error: kidsError } = await supabase
      .from("kid_profile")
      .select("kid_id, fname, lname, grade, age, medium, premium_status, subscription_ID")
      .eq("user_id", user_id)
      .in("premium_status", ["Premium", "active"]);

    if (kidsError) {
      console.error("Error fetching premium kids:", kidsError);
    }

    // Group kids by subscription_ID
    const kidsGroupedBySubscription = (allKids || []).reduce((acc, kid) => {
      if (kid.subscription_ID) {
        if (!acc[kid.subscription_ID]) {
          acc[kid.subscription_ID] = [];
        }
        acc[kid.subscription_ID].push(kid);
      }
      return acc;
    }, {});

    // Attach kids to their respective subscriptions
    const subscriptionsWithKids = subscriptions.map(sub => ({
      ...sub,
      kids: kidsGroupedBySubscription[sub.subscription_id] || []
    }));

    // Return the primary (most recent) subscription for backward compatibility
    // and all subscriptions with their kids
    res.json({ 
      subscription: subscriptions[0] || null,
      subscriptions: subscriptionsWithKids,
      kids: allKids || []
    });
  } catch (error) {
    console.error("Error fetching active subscription:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get subscription by ID
export const getSubscriptionById = async (req, res) => {
  try {
    const { subscription_id } = req.params;
    const user_id = req.user?.user_id;

    const { data, error } = await supabase
      .from("subscription")
      .select("*")
      .eq("subscription_id", subscription_id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    // Verify user owns this subscription
    if (data.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create new subscription
export const createSubscription = async (req, res) => {
  try {
    const {
      billing_period,
      total_amount,
      kid_ids,
    } = req.body;

    const user_id = req.user?.user_id;

    if (!billing_period || !total_amount) {
      return res.status(400).json({ error: "Billing period and amount are required" });
    }

    if (!["Monthly", "Yearly", "Weekly", "Daily"].includes(billing_period)) {
      return res.status(400).json({ error: "Invalid billing period" });
    }

    // Validate kid_ids (1-5 kids required)
    if (!Array.isArray(kid_ids) || kid_ids.length < 1 || kid_ids.length > 5) {
      return res.status(400).json({ error: "You must select between 1 and 5 kid profiles" });
    }

    // Verify all kid_ids belong to this user
    const { data: kids, error: kidsErr } = await supabase
      .from("kid_profile")
      .select("kid_id")
      .in("kid_id", kid_ids)
      .eq("user_id", user_id);

    if (kidsErr) throw kidsErr;
    if (!kids || kids.length !== kid_ids.length) {
      return res.status(400).json({ error: "One or more kid profiles not found or do not belong to you" });
    }

    // Calculate renewal date
    const subscribed_date = new Date();
    let renewal_date = new Date();

    switch (billing_period) {
      case "Daily":
        renewal_date.setDate(renewal_date.getDate() + 1);
        break;
      case "Weekly":
        renewal_date.setDate(renewal_date.getDate() + 7);
        break;
      case "Monthly":
        renewal_date.setMonth(renewal_date.getMonth() + 1);
        break;
      case "Yearly":
        renewal_date.setFullYear(renewal_date.getFullYear() + 1);
        break;
    }

    const subscription_id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subscriptionData = {
      subscription_id,
      user_id,
      total_amount: parseFloat(total_amount),
      billing_period,
      subscribed_date: subscribed_date.toISOString().split('T')[0],
      renewal_date: renewal_date.toISOString().split('T')[0],
      payment_status: "Pending",
      is_active: false,
    };

    const { data, error } = await supabase
      .from("subscription")
      .insert(subscriptionData)
      .select()
      .single();

    if (error) throw error;

    // Link selected kid profiles to this subscription
    for (const kid_id of kid_ids) {
      const { error: linkErr } = await supabase
        .from("kid_profile")
        .update({ "subscription_ID": subscription_id })
        .eq("kid_id", kid_id)
        .eq("user_id", user_id);
      if (linkErr) throw linkErr;
    }

    res.json({ message: "Subscription created successfully", subscription: data, linked_kids: kid_ids });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update subscription (for payment status, renewal, etc.)
export const updateSubscription = async (req, res) => {
  try {
    const { subscription_id } = req.params;
    const { payment_status, renewal_date } = req.body;

    const user_id = req.user?.user_id;

    // Verify subscription belongs to user
    const { data: subData, error: subError } = await supabase
      .from("subscription")
      .select("user_id")
      .eq("subscription_id", subscription_id)
      .single();

    if (subError || !subData) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (subData.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updateData = {};
    if (payment_status) {
      if (!["Paid", "Failed", "Pending"].includes(payment_status)) {
        return res.status(400).json({ error: "Invalid payment status" });
      }
      updateData.payment_status = payment_status;
      // Keep is_active in sync with payment_status
      if (payment_status === "Paid") updateData.is_active = true;
      if (payment_status === "Failed") updateData.is_active = false;
    }
    if (renewal_date) {
      updateData.renewal_date = renewal_date;
    }

    // Sync kid premium_status for kids linked to this subscription
    if (payment_status === "Paid") {
      const { error: kidErr } = await supabase
        .from("kid_profile")
        .update({ premium_status: "Premium" })
        .eq("subscription_ID", subscription_id);
      if (kidErr) console.error("Warning: could not upgrade kid profiles:", kidErr.message);
    } else if (payment_status === "Failed" || payment_status === "Pending") {
      // Downgrade kids linked to this subscription and unlink them
      const { error: kidErr } = await supabase
        .from("kid_profile")
        .update({ premium_status: "Free", "subscription_ID": null })
        .eq("subscription_ID", subscription_id);
      if (kidErr) console.error("Warning: could not downgrade kid profiles:", kidErr.message);
    }

    const { data, error } = await supabase
      .from("subscription")
      .update(updateData)
      .eq("subscription_id", subscription_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Subscription updated successfully", subscription: data });
  } catch (error) {
    console.error("Error updating subscription:", error);
    res.status(500).json({ error: error.message });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const { subscription_id } = req.params;
    const { reason, kid_ids } = req.body || {};
    const user_id = req.user?.user_id;

    // Verify subscription belongs to user
    const { data: subData, error: subError } = await supabase
      .from("subscription")
      .select("user_id")
      .eq("subscription_id", subscription_id)
      .single();

    if (subError || !subData) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (subData.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // If kid_ids are provided, only cancel those specific kids
    if (kid_ids && Array.isArray(kid_ids) && kid_ids.length > 0) {
      // Downgrade only selected kid profiles
      const { error: kidErr } = await supabase
        .from("kid_profile")
        .update({ premium_status: "Free", "subscription_ID": null })
        .in("kid_id", kid_ids)
        .eq("subscription_ID", subscription_id);
      
      if (kidErr) {
        console.error("Warning: could not downgrade selected kid profiles:", kidErr.message);
      }

      // Check if there are any remaining premium kids for this subscription
      const { data: remainingKids, error: remainingErr } = await supabase
        .from("kid_profile")
        .select("kid_id")
        .eq("subscription_ID", subscription_id)
        .eq("premium_status", "Premium");

      if (remainingErr) {
        console.error("Warning: could not check remaining kids:", remainingErr.message);
      }

      // If no premium kids remain, mark subscription as inactive and save reason
      if (!remainingKids || remainingKids.length === 0) {
        const updateData = { is_active: false };
        if (reason) {
          updateData.Unsubscribe_reasons = reason;
        }

        const { data, error } = await supabase
          .from("subscription")
          .update(updateData)
          .eq("subscription_id", subscription_id)
          .select()
          .single();

        if (error) throw error;

        // Reset user account_status back to Active
        const { error: userError } = await supabase
          .from("user")
          .update({ account_status: "Active" })
          .eq("user_id", subData.user_id);

        if (userError) console.error("Warning: could not reset user account_status:", userError.message);

        if (reason) console.log(`🗑️ Subscription ${subscription_id} fully cancelled. Reason: ${reason}`);
        
        return res.json({ 
          message: "Subscription cancelled for selected profiles. All premium profiles removed.", 
          subscription: data,
          cancelled_kids: kid_ids.length
        });
      } else {
        // Partial cancellation - save reason but keep subscription active
        if (reason) {
          const { error: reasonError } = await supabase
            .from("subscription")
            .update({ Unsubscribe_reasons: reason })
            .eq("subscription_id", subscription_id);
          
          if (reasonError) {
            console.error("Warning: could not save unsubscribe reason:", reasonError.message);
          }
        }

        if (reason) console.log(`🗑️ Subscription ${subscription_id} partially cancelled for ${kid_ids.length} kid(s). Reason: ${reason}`);
        
        return res.json({ 
          message: `Premium access removed from ${kid_ids.length} profile(s). ${remainingKids.length} profile(s) remain premium.`,
          cancelled_kids: kid_ids.length,
          remaining_kids: remainingKids.length
        });
      }
    } else {
      // Original behavior: cancel entire subscription
      // Mark subscription as inactive and save reason
      const updateData = { is_active: false };
      if (reason) {
        updateData.Unsubscribe_reasons = reason;
      }

      const { data, error } = await supabase
        .from("subscription")
        .update(updateData)
        .eq("subscription_id", subscription_id)
        .select()
        .single();

      if (error) throw error;

      // Reset user account_status back to Active
      const { error: userError } = await supabase
        .from("user")
        .update({ account_status: "Active" })
        .eq("user_id", subData.user_id);

      if (userError) console.error("Warning: could not reset user account_status:", userError.message);

      // Downgrade all kid profiles linked to this subscription and unlink them
      const { error: kidErr } = await supabase
        .from("kid_profile")
        .update({ premium_status: "Free", "subscription_ID": null })
        .eq("subscription_ID", subscription_id);
      if (kidErr) console.error("Warning: could not downgrade kid profiles:", kidErr.message);

      if (reason) console.log(`🗑️ Subscription ${subscription_id} cancelled. Reason: ${reason}`);

      res.json({ message: "Subscription cancelled", subscription: data });
    }
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    res.status(500).json({ error: error.message });
  }
};

// Process payment (payment webhook/completion)
export const processPayment = async (req, res) => {
  try {
    const {
      subscription_id,
      payment_method,
      transaction_amount,
      payment_details,
    } = req.body;

    if (!subscription_id || !payment_method || !transaction_amount) {
      return res.status(400).json({ error: "Missing required payment details" });
    }

    // Get subscription
    const { data: subscription, error: subError } = await supabase
      .from("subscription")
      .select("*")
      .eq("subscription_id", subscription_id)
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    // Create transaction record
    const transaction_id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionData = {
      transaction_id,
      subscription_id,
      amount: parseFloat(transaction_amount),
      method: payment_method,
      transaction_date: new Date().toISOString().split('T')[0],
      status: "Success",
    };

    const { data: transaction, error: txnError } = await supabase
      .from("transaction")
      .insert(transactionData)
      .select()
      .single();

    if (txnError) throw txnError;

    // Update subscription to Paid and mark as active
    const { data: updatedSub, error: updateError } = await supabase
      .from("subscription")
      .update({ payment_status: "Paid", is_active: true })
      .eq("subscription_id", subscription_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update user account status to Paid
    const { error: userUpdateError } = await supabase
      .from("user")
      .update({ account_status: "Paid" })
      .eq("user_id", subscription.user_id);

    if (userUpdateError) {
      console.error("Error updating user account status:", userUpdateError);
    }

    // Upgrade kid profiles linked to this subscription via FK
    const { error: kidErr } = await supabase
      .from("kid_profile")
      .update({ premium_status: "Premium" })
      .eq("subscription_ID", subscription_id);
    if (kidErr) console.error("Warning: could not upgrade kid profiles:", kidErr.message);

    // If kid_ids provided and no kids are linked yet, link them now
    const { kid_ids } = req.body;
    if (Array.isArray(kid_ids) && kid_ids.length > 0 && kid_ids.length <= 5) {
      for (const kid_id of kid_ids) {
        await supabase
          .from("kid_profile")
          .update({ "subscription_ID": subscription_id, premium_status: "Premium" })
          .eq("kid_id", kid_id)
          .eq("user_id", subscription.user_id);
      }
    }

    res.json({
      message: "Payment processed successfully",
      subscription: updatedSub,
      transaction,
    });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get subscription statistics (admin)
export const getSubscriptionStats = async (req, res) => {
  try {
    console.log('📊 Subscription stats request - User:', req.user?.user_id, 'Role:', req.user?.role);
    
    // TODO: Add proper admin role check
    // For now, allow any authenticated user to access (will be restricted later)
    if (!req.user?.user_id) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    console.log('✅ Access granted to user:', req.user?.user_id);

    const { data: allSubs, error: allError } = await supabase
      .from("subscription")
      .select("*");

    if (allError) throw allError;

    // Calculate active subscriptions revenue
    const activeSubscriptions = allSubs.filter(s => s.is_active === true);
    const totalActiveRevenue = activeSubscriptions.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);

    // Calculate cancelled subscriptions (is_active = false)
    // These are subscriptions that have been cancelled but may still have time remaining
    const cancelledSubscriptions = allSubs.filter(s => s.is_active === false);
    
    const totalCancelledValue = cancelledSubscriptions.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);

    // Calculate refunded subscriptions
    const refundedSubscriptions = allSubs.filter(s => s.refunded === true);
    const totalRefundedAmount = refundedSubscriptions.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);

    // Get all transactions for paid subscriptions
    const { data: transactions, error: txnError } = await supabase
      .from("transaction")
      .select("*")
      .eq("status", "Success");

    if (txnError) throw txnError;

    // Calculate total income from transactions
    const totalTransactionIncome = transactions?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;
    
    // Subtract refunded amounts from total income
    const totalIncome = totalTransactionIncome - totalRefundedAmount;

    const stats = {
      total: allSubs.length,
      active: activeSubscriptions.length,
      pending: allSubs.filter(s => s.payment_status === "Pending").length,
      failed: allSubs.filter(s => s.payment_status === "Failed").length,
      cancelled: cancelledSubscriptions.length,
      refunded: refundedSubscriptions.length,
      monthly: allSubs.filter(s => s.billing_period === "Monthly").length,
      yearly: allSubs.filter(s => s.billing_period === "Yearly").length,
      total_revenue: totalActiveRevenue,
      total_income: totalIncome,
      total_refunded: totalRefundedAmount,
      cancelled_value: totalCancelledValue,
      active_subscriptions: activeSubscriptions,
      cancelled_subscriptions: cancelledSubscriptions,
      refunded_subscriptions: refundedSubscriptions,
    };

    res.json({ stats });
  } catch (error) {
    console.error("Error fetching subscription stats:", error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// Bypass/test: confirm payment without PayHere
// POST /subscriptions/bypass-payment  (authenticated)
// ─────────────────────────────────────────────
export const confirmPaymentBypass = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    const { subscription_id, kid_ids } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ error: "subscription_id is required" });
    }

    // Verify subscription belongs to this user
    const { data: sub, error: subErr } = await supabase
      .from("subscription")
      .select("*")
      .eq("subscription_id", subscription_id)
      .single();

    if (subErr || !sub) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    if (sub.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Mark subscription as Paid and active
    const { data: updatedSub, error: updateErr } = await supabase
      .from("subscription")
      .update({ payment_status: "Paid", is_active: true })
      .eq("subscription_id", subscription_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Create a bypass transaction record
    const transaction_id = `txn_bypass_${Date.now()}`;
    await supabase.from("transaction").insert({
      transaction_id,
      subscription_id,
      amount: parseFloat(sub.total_amount),
      method: "Bypass",
      transaction_date: new Date().toISOString().split("T")[0],
      status: "Success",
    });

    // Update user account_status to Paid
    await supabase.from("user").update({ account_status: "Paid" }).eq("user_id", sub.user_id);

    // Upgrade kid profiles linked to this subscription via FK
    await supabase
      .from("kid_profile")
      .update({ premium_status: "Premium" })
      .eq("subscription_ID", subscription_id);

    // If kid_ids provided and no kids are linked yet, link them now
    if (Array.isArray(kid_ids) && kid_ids.length > 0 && kid_ids.length <= 5) {
      for (const kid_id of kid_ids) {
        await supabase
          .from("kid_profile")
          .update({ "subscription_ID": subscription_id, premium_status: "Premium" })
          .eq("kid_id", kid_id)
          .eq("user_id", sub.user_id);
      }
    }

    console.log(`✅ Bypass payment confirmed for subscription ${subscription_id}`);
    res.json({ message: "Payment confirmed (bypass)", subscription: updatedSub });
  } catch (error) {
    console.error("Bypass payment error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get kids linked to a subscription
// GET /subscriptions/:subscription_id/kids
// ─────────────────────────────────────────────
export const getSubscriptionKids = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    const { subscription_id } = req.params;

    // Verify subscription belongs to user (or admin)
    const { data: sub, error: subErr } = await supabase
      .from("subscription")
      .select("user_id")
      .eq("subscription_id", subscription_id)
      .single();

    if (subErr || !sub) return res.status(404).json({ error: "Subscription not found" });
    if (sub.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { data: kids, error } = await supabase
      .from("kid_profile")
      .select("*")
      .eq("subscription_ID", subscription_id);

    if (error) throw error;

    res.json({ kids: kids || [] });
  } catch (error) {
    console.error("Error fetching subscription kids:", error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────
// Update kids linked to a subscription (replace list)
// PUT /subscriptions/:subscription_id/kids
// Body: { kid_ids: ["KID-...", "KID-..."] }  (1-5 items)
// ─────────────────────────────────────────────
export const updateSubscriptionKids = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    const { subscription_id } = req.params;
    const { kid_ids } = req.body;

    if (!Array.isArray(kid_ids) || kid_ids.length < 1 || kid_ids.length > 5) {
      return res.status(400).json({ error: "You must select between 1 and 5 kid profiles" });
    }

    // Verify subscription belongs to user and is active
    const { data: sub, error: subErr } = await supabase
      .from("subscription")
      .select("*")
      .eq("subscription_id", subscription_id)
      .single();

    if (subErr || !sub) return res.status(404).json({ error: "Subscription not found" });
    if (sub.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Verify all kid_ids belong to this user
    const { data: validKids, error: kidsErr } = await supabase
      .from("kid_profile")
      .select("kid_id")
      .in("kid_id", kid_ids)
      .eq("user_id", user_id);

    if (kidsErr) throw kidsErr;
    if (!validKids || validKids.length !== kid_ids.length) {
      return res.status(400).json({ error: "One or more kid profiles not found or do not belong to you" });
    }

    // Unlink all kids currently on this subscription
    const { error: unlinkErr } = await supabase
      .from("kid_profile")
      .update({ "subscription_ID": null, premium_status: "Free" })
      .eq("subscription_ID", subscription_id);
    if (unlinkErr) throw unlinkErr;

    // Link the new set of kids
    const isPaid = sub.is_active && sub.payment_status === "Paid";
    for (const kid_id of kid_ids) {
      const { error: linkErr } = await supabase
        .from("kid_profile")
        .update({
          "subscription_ID": subscription_id,
          premium_status: isPaid ? "Premium" : "Free",
        })
        .eq("kid_id", kid_id)
        .eq("user_id", user_id);
      if (linkErr) throw linkErr;
    }

    res.json({ message: "Subscription kids updated successfully", linked_kids: kid_ids });
  } catch (error) {
    console.error("Error updating subscription kids:", error);
    res.status(500).json({ error: error.message });
  }
};
