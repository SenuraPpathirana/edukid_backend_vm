/**
 * Integration tests for /api/auth routes.
 *
 * Supabase and email services are mocked so no real database or SMTP
 * connection is required. Each test controls exactly what Supabase returns.
 */

import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import request from "supertest";

// ─── Mock Supabase ────────────────────────────────────────────────────────────
// Must be declared before importing app so the module resolver picks up the mock.
const mockSupabase = {
  from: jest.fn(),
};

jest.unstable_mockModule("../../config/supabase.js", () => ({
  supabase: mockSupabase,
}));

// ─── Mock email service ───────────────────────────────────────────────────────
jest.unstable_mockModule("../../modules/email/email.service.js", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  testEmailConfig: jest.fn().mockResolvedValue(true),
}));

// ─── Import app AFTER mocks are registered ────────────────────────────────────
let app;
beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-key-for-integration-tests";
  process.env.JWT_EXPIRES_IN = "15m";
  process.env.OTP_EXPIRES_MIN = "10";

  const mod = await import("../../app.js");
  app = mod.default;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query mock.
 * Each method returns `this` so calls can be chained freely.
 * `resolveWith` sets the final resolved value of the chain.
 */
const buildQueryMock = (resolveValue = { data: null, error: null }) => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(resolveValue),
    single: jest.fn().mockResolvedValue(resolveValue),
  };
  return chain;
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  const validBody = {
    fname: "Jane",
    lname: "Doe",
    email: "jane@example.com",
    password: "Secret123",
  };

  it("returns 400 when fname is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, fname: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("returns 400 for a weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, password: "weak" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it("returns 409 when email is already registered", async () => {
    // Supabase returns an existing user
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: { user_id: "existing-id" }, error: null })
    );

    const res = await request(app)
      .post("/api/auth/register")
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("returns 201 on successful registration", async () => {
    // First call: check existing → not found
    // Second call: insert user → success
    // Third call: insert OTP → success
    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Check existing user
        return buildQueryMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // Insert user
        return buildQueryMock({
          data: {
            user_id: "new-uuid",
            email: "jane@example.com",
            is_verified: false,
            role: "user",
          },
          error: null,
        });
      }
      // Insert OTP
      return buildQueryMock({ data: {}, error: null });
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/registered/i);
    expect(res.body.user.email).toBe("jane@example.com");
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("returns 400 for an invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "bad-email", password: "Secret123" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "jane@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it("returns 401 when user is not found", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Secret123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("returns 403 when email is not verified", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({
        data: {
          user_id: "u1",
          email: "jane@example.com",
          password_hash: "$2b$10$invalidhash",
          is_verified: false,
          account_status: "Free",
          role: "user",
        },
        error: null,
      })
    );

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "jane@example.com", password: "Secret123" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not verified/i);
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
describe("POST /api/auth/forgot-password", () => {
  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-valid" });

    expect(res.status).toBe(400);
  });

  it("returns 200 even when email does not exist (security by design)", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if this email exists/i);
  });
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
describe("POST /api/auth/verify-otp", () => {
  it("returns 400 for an invalid OTP format (not 6 digits)", async () => {
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "jane@example.com", otp: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/otp/i);
  });

  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "bad", otp: "123456" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when user is not found", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "nobody@example.com", otp: "123456" });

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
describe("POST /api/auth/resend-otp", () => {
  it("returns 400 for an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/resend-otp")
      .send({ email: "invalid" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when user does not exist", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .post("/api/auth/resend-otp")
      .send({ email: "ghost@example.com" });

    expect(res.status).toBe(404);
  });
});
