import { supabase } from "../../config/supabase.js";

// Get all transactions for a user
export const getUserTransactions = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("transaction")
      .select(`
        *,
        subscription!inner(user_id, billing_period)
      `)
      .eq("subscription.user_id", user_id)
      .order("transaction_date", { ascending: false });

    if (error) throw error;

    res.json({ transactions: data || [] });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction by ID
export const getTransactionById = async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const user_id = req.user?.user_id;

    const { data, error } = await supabase
      .from("transaction")
      .select(`
        *,
        subscription!inner(user_id, subscription_id, billing_period, total_amount)
      `)
      .eq("transaction_id", transaction_id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Verify user owns this transaction
    if (data.subscription.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transactions for a subscription
export const getSubscriptionTransactions = async (req, res) => {
  try {
    const { subscription_id } = req.params;
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

    const { data, error } = await supabase
      .from("transaction")
      .select("*")
      .eq("subscription_id", subscription_id)
      .order("transaction_date", { ascending: false });

    if (error) throw error;

    res.json({ transactions: data || [] });
  } catch (error) {
    console.error("Error fetching subscription transactions:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create transaction (typically called during payment processing)
export const createTransaction = async (req, res) => {
  try {
    const {
      subscription_id,
      amount,
      method,
      status = "Pending",
    } = req.body;

    if (!subscription_id || !amount) {
      return res.status(400).json({ error: "Subscription ID and amount are required" });
    }

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

    if (!["Success", "Pending", "Failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const transaction_id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionData = {
      transaction_id,
      subscription_id,
      amount: parseFloat(amount),
      method: method || "PayHere",
      transaction_date: new Date().toISOString().split('T')[0],
      status,
    };

    const { data, error } = await supabase
      .from("transaction")
      .insert(transactionData)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Transaction created successfully", transaction: data });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update transaction status
export const updateTransactionStatus = async (req, res) => {
  try {
    const { transaction_id } = req.params;
    const { status } = req.body;

    if (!status || !["Success", "Pending", "Failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const user_id = req.user?.user_id;

    // Verify transaction belongs to user
    const { data: txnData, error: txnError } = await supabase
      .from("transaction")
      .select(`
        subscription!inner(user_id)
      `)
      .eq("transaction_id", transaction_id)
      .single();

    if (txnError || !txnData) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (txnData.subscription.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("transaction")
      .update({ status })
      .eq("transaction_id", transaction_id)
      .select()
      .single();

    if (error) throw error;

    // If transaction successful, update subscription payment status and activate it
    if (status === "Success") {
      const { error: subUpdateError } = await supabase
        .from("subscription")
        .update({ payment_status: "Paid", is_active: true })
        .eq("subscription_id", data.subscription_id);

      if (subUpdateError) {
        console.error("Error updating subscription payment status:", subUpdateError);
      }
    }

    res.json({ message: "Transaction status updated", transaction: data });
  } catch (error) {
    console.error("Error updating transaction status:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction statistics (admin)
export const getTransactionStats = async (req, res) => {
  try {
    // Only admins can access this
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { data: allTxns, error: allError } = await supabase
      .from("transaction")
      .select("*");

    if (allError) throw allError;

    const stats = {
      total: allTxns.length,
      successful: allTxns.filter(t => t.status === "Success").length,
      pending: allTxns.filter(t => t.status === "Pending").length,
      failed: allTxns.filter(t => t.status === "Failed").length,
      total_revenue: allTxns
        .filter(t => t.status === "Success")
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
      by_method: allTxns.reduce((acc, t) => {
        const method = t.method || "Unknown";
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({ stats });
  } catch (error) {
    console.error("Error fetching transaction stats:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get recent transactions (for dashboard)
export const getRecentTransactions = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { limit = 5 } = req.query;

    const { data, error } = await supabase
      .from("transaction")
      .select(`
        *,
        subscription!inner(user_id, billing_period)
      `)
      .eq("subscription.user_id", user_id)
      .order("transaction_date", { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ transactions: data || [] });
  } catch (error) {
    console.error("Error fetching recent transactions:", error);
    res.status(500).json({ error: error.message });
  }
};
