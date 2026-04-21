import express from "express";
import cors from "cors";
import { supabase } from "./config/supabase.js";
import authRoutes from "./modules/auth/auth.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import kidsRoutes from "./modules/kids/kids.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import timersRoutes from "./modules/timers/timers.routes.js";
import statisticsRoutes from "./modules/statistics/statistics.routes.js";
import materialsRoutes from "./modules/materials/materials.routes.js";
import quizzesRoutes from "./modules/quizzes/quizzes.routes.js";
import gamesRoutes from "./modules/games/games.routes.js";
import progressRoutes from "./modules/progress/progress.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import certificatesRoutes from "./modules/certificates/certificates.routes.js";
import subscriptionsRoutes from "./modules/subscriptions/subscriptions.routes.js";
import transactionsRoutes from "./modules/transactions/transactions.routes.js";
import { testEmailConfig, sendVerificationEmail } from "./modules/email/email.service.js";

const app = express();

// middlewares
// Configure CORS — supports dev wildcard and production origin whitelist.
// Add origins via FRONTEND_URL or comma-separated ALLOWED_ORIGINS in .env
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
  // Support multiple extra origins: ALLOWED_ORIGINS=http://1.2.3.4:8080,https://yourdomain.com
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [])
].filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman, PayHere webhooks)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Parse JSON with better error handling
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global error handler for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ 
      error: 'Invalid JSON format. Please ensure Content-Type is application/json and body is valid JSON.' 
    });
  }
  next();
});

// ✅ REGISTER ROUTES HERE (NOT inside another route)
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kids", kidsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/timers", timersRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/materials", materialsRoutes);
app.use("/api/quizzes", quizzesRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/certificates", certificatesRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/transactions", transactionsRoutes);

// Email test endpoint
app.post("/api/test-email", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Test configuration
    const configOk = await testEmailConfig();
    if (!configOk) {
      return res.status(500).json({ 
        error: "Email configuration is invalid. Please check your .env settings." 
      });
    }

    // Send test email
    const testOtp = "123456";
    await sendVerificationEmail(email, testOtp, "Test User");

    res.json({ 
      message: "Test email sent successfully! Check your inbox.",
      email: email
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      details: "Failed to send test email. Check console for details."
    });
  }
});

// root test
app.get("/", (req, res) => {
  res.send("EduKid Backend Running");
});

// ✅ test insert route
app.post("/test-insert", async (req, res) => {
  const { fname, lname, email } = req.body;

  const { data, error } = await supabase
    .from("user") // make sure this table exists
    .insert([{
      fname,
      lname,
      email
    }])
    .select();

  if (error) return res.status(400).json({ error: error.message });

  res.json({ inserted: data });
});

export default app;


