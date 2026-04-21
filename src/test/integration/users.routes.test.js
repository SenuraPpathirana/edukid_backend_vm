/**
 * Integration tests for /api/users routes.
 *
 * Supabase is mocked. A valid JWT is generated for authenticated requests.
 */

import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import request from "supertest";
import { signAccessToken } from "../../utils/jwt.js";

// ─── Mock Supabase ────────────────────────────────────────────────────────────
const mockSupabase = { from: jest.fn() };

jest.unstable_mockModule("../../config/supabase.js", () => ({
  supabase: mockSupabase,
}));

jest.unstable_mockModule("../../modules/email/email.service.js", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  testEmailConfig: jest.fn().mockResolvedValue(true),
}));

let app;
let authToken;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-key-for-integration-tests";
  process.env.JWT_EXPIRES_IN = "15m";

  const mod = await import("../../app.js");
  app = mod.default;

  authToken = signAccessToken({
    user_id: "user-abc",
    role: "user",
    account_status: "Free",
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const buildQueryMock = (resolveValue = { data: null, error: null }) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(resolveValue),
  single: jest.fn().mockResolvedValue(resolveValue),
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────
describe("GET /api/users/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not found in DB", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 200 with user data", async () => {
    const user = {
      user_id: "user-abc",
      fname: "Jane",
      lname: "Doe",
      email: "jane@example.com",
      role: "user",
      is_verified: true,
      account_status: "Free",
    };

    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: user, error: null })
    );

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("jane@example.com");
    expect(res.body.user.fname).toBe("Jane");
  });

  it("returns 500 when Supabase returns an error", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: { message: "DB connection failed" } })
    );

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(500);
  });
});

// ─── PUT /api/users/me ────────────────────────────────────────────────────────
describe("PUT /api/users/me", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .send({ fname: "Updated" });

    expect(res.status).toBe(401);
  });

  it("returns 200 when updating basic profile fields", async () => {
    const updatedUser = {
      user_id: "user-abc",
      fname: "Updated",
      lname: "Doe",
      email: "jane@example.com",
      role: "user",
    };

    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: updatedUser, error: null })
    );

    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ fname: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(res.body.user.fname).toBe("Updated");
  });

  it("returns 400 when email is already taken by another user", async () => {
    // First call: check if email is taken → returns another user
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: { user_id: "other-user" }, error: null })
    );

    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already in use/i);
  });
});

// ─── POST /api/users/me/report-error ─────────────────────────────────────────
describe("POST /api/users/me/report-error", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/users/me/report-error")
      .send({ subject: "Bug", message: "Something broke" });

    expect(res.status).toBe(401);
  });

  it("returns 400 when subject is missing", async () => {
    const res = await request(app)
      .post("/api/users/me/report-error")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "Something broke" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subject/i);
  });

  it("returns 400 when message is missing", async () => {
    const res = await request(app)
      .post("/api/users/me/report-error")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "Bug" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/i);
  });

  it("returns 400 when subject exceeds 255 characters", async () => {
    const res = await request(app)
      .post("/api/users/me/report-error")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "A".repeat(256), message: "Details here" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/255/);
  });

  it("returns 201 on successful report submission", async () => {
    const report = {
      error_report_id: "ERR-123-ABC",
      subject: "App crashes",
      status: "Pending",
      submitted_at: new Date().toISOString(),
    };

    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: report, error: null })
    );

    const res = await request(app)
      .post("/api/users/me/report-error")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ subject: "App crashes", message: "Detailed description" });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/submitted/i);
    expect(res.body.report.status).toBe("Pending");
  });
});
