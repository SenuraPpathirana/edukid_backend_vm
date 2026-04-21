/**
 * Integration tests for /api/kids routes.
 *
 * Supabase is mocked. A valid JWT is generated for each test that
 * requires authentication.
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

  authToken = signAccessToken({ user_id: "user-123", role: "user", account_status: "Free" });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const buildQueryMock = (resolveValue = { data: null, error: null }) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue(resolveValue),
  single: jest.fn().mockResolvedValue(resolveValue),
  // For delete which resolves directly
  then: undefined,
});

// Make delete().eq().eq() resolve to { error: null }
const buildDeleteMock = (resolveValue = { error: null }) => {
  const chain = {
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  };
  // The last .eq() call needs to resolve
  chain.eq.mockImplementation(() => Promise.resolve(resolveValue));
  return chain;
};

// ─── GET /api/kids ────────────────────────────────────────────────────────────
describe("GET /api/kids", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/kids");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty kids array", async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await request(app)
      .get("/api/kids")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kids).toEqual([]);
  });

  it("returns 200 with a list of kids", async () => {
    const kids = [
      { kid_id: "KID-1", fname: "Tom", lname: "Doe", grade: "3", age: 8 },
    ];

    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: kids, error: null }),
    });

    const res = await request(app)
      .get("/api/kids")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kids).toHaveLength(1);
    expect(res.body.kids[0].fname).toBe("Tom");
  });
});

// ─── POST /api/kids ───────────────────────────────────────────────────────────
describe("POST /api/kids", () => {
  const validKid = {
    firstName: "Tom",
    lastName: "Doe",
    grade: "3",
    age: 8,
    gender: "Male",
    medium: "English",
  };

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/kids").send(validKid);
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/kids")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ firstName: "Tom" }); // missing lastName, grade, age

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when age is out of range", async () => {
    const res = await request(app)
      .post("/api/kids")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validKid, age: 25 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/age/i);
  });

  it("returns 400 when age is 0", async () => {
    const res = await request(app)
      .post("/api/kids")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ ...validKid, age: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 201 on successful creation", async () => {
    const createdKid = {
      kid_id: "KID-123",
      user_id: "user-123",
      fname: "Tom",
      lname: "Doe",
      grade: "3",
      age: 8,
      medium: "English",
      premium_status: "Free",
    };

    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: createdKid, error: null })
    );

    const res = await request(app)
      .post("/api/kids")
      .set("Authorization", `Bearer ${authToken}`)
      .send(validKid);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created/i);
    expect(res.body.kid.fname).toBe("Tom");
  });
});

// ─── PUT /api/kids/:id ────────────────────────────────────────────────────────
describe("PUT /api/kids/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).put("/api/kids/KID-1").send({ firstName: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when kid does not belong to the user", async () => {
    mockSupabase.from.mockReturnValue(
      buildQueryMock({ data: null, error: null })
    );

    const res = await request(app)
      .put("/api/kids/KID-NOTMINE")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ firstName: "Updated" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 200 on successful update", async () => {
    const existingKid = { kid_id: "KID-1", user_id: "user-123", fname: "Tom" };
    const updatedKid = { ...existingKid, fname: "Thomas" };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      // First call: fetch existing kid
      if (callCount === 1) return buildQueryMock({ data: existingKid, error: null });
      // Second call: update kid
      return buildQueryMock({ data: updatedKid, error: null });
    });

    const res = await request(app)
      .put("/api/kids/KID-1")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ firstName: "Thomas" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
  });
});

// ─── DELETE /api/kids/:id ─────────────────────────────────────────────────────
describe("DELETE /api/kids/:id", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).delete("/api/kids/KID-1");
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful deletion", async () => {
    mockSupabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      // Final .eq() resolves with no error
      then: undefined,
    });

    // Override: make the chain resolve properly
    const chain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn(),
    };
    // First .eq() returns chain, second .eq() resolves
    let eqCount = 0;
    chain.eq.mockImplementation(() => {
      eqCount++;
      if (eqCount >= 2) return Promise.resolve({ error: null });
      return chain;
    });
    mockSupabase.from.mockReturnValue(chain);

    const res = await request(app)
      .delete("/api/kids/KID-1")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// ─── PATCH /api/kids/:id/premium (deprecated) ────────────────────────────────
describe("PATCH /api/kids/:id/premium", () => {
  it("returns 410 Gone (deprecated endpoint)", async () => {
    const res = await request(app)
      .patch("/api/kids/KID-1/premium")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ premium: true });

    expect(res.status).toBe(410);
  });
});
