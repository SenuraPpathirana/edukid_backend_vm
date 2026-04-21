import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import { authenticate, requireRole, optionalAuth } from "../../middleware/auth.js";
import { signAccessToken } from "../../utils/jwt.js";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.JWT_EXPIRES_IN = "15m";
});

// Helper to build a mock Express req/res/next
const mockReqResNext = (headers = {}) => {
  const req = { headers, user: null };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("authenticate middleware", () => {
  it("calls next() with a valid Bearer token", () => {
    const token = signAccessToken({ user_id: "u1", role: "user" });
    const { req, res, next } = mockReqResNext({
      authorization: `Bearer ${token}`,
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user.user_id).toBe("u1");
  });

  it("returns 401 when Authorization header is missing", () => {
    const { req, res, next } = mockReqResNext({});

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header does not start with Bearer", () => {
    const { req, res, next } = mockReqResNext({
      authorization: "Basic sometoken",
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", () => {
    const { req, res, next } = mockReqResNext({
      authorization: "Bearer invalid.token.here",
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireRole middleware", () => {
  it("calls next() when user has the required role", () => {
    const { req, res, next } = mockReqResNext();
    req.user = { user_id: "u1", role: "admin" };

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when user has a different role", () => {
    const { req, res, next } = mockReqResNext();
    req.user = { user_id: "u1", role: "user" };

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when req.user is not set", () => {
    const { req, res, next } = mockReqResNext();
    req.user = undefined;

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("optionalAuth middleware", () => {
  it("attaches user when a valid token is provided", () => {
    const token = signAccessToken({ user_id: "u2", role: "user" });
    const { req, res, next } = mockReqResNext({
      authorization: `Bearer ${token}`,
    });

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user.user_id).toBe("u2");
  });

  it("calls next() without setting user when no token is provided", () => {
    const { req, res, next } = mockReqResNext({});

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });

  it("calls next() and sets user to null when token is invalid", () => {
    const { req, res, next } = mockReqResNext({
      authorization: "Bearer bad.token.value",
    });

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });
});
