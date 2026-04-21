import { describe, it, expect, beforeAll } from "@jest/globals";
import { signAccessToken, verifyAccessToken } from "../../utils/jwt.js";

// Set a test secret so JWT functions work without a real .env
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.JWT_EXPIRES_IN = "15m";
});

describe("signAccessToken", () => {
  it("returns a non-empty string", () => {
    const token = signAccessToken({ user_id: "123", role: "user" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("produces a JWT with three dot-separated parts", () => {
    const token = signAccessToken({ user_id: "123", role: "user" });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });
});

describe("verifyAccessToken", () => {
  it("decodes a valid token and returns the payload", () => {
    const payload = { user_id: "abc-123", role: "admin", account_status: "Premium" };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.user_id).toBe(payload.user_id);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.account_status).toBe(payload.account_status);
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken({ user_id: "123" });
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("throws on a completely invalid token", () => {
    expect(() => verifyAccessToken("not.a.token")).toThrow();
  });

  it("throws on an empty string", () => {
    expect(() => verifyAccessToken("")).toThrow();
  });
});
