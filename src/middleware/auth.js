import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Middleware to verify JWT token from Authorization header
 * Usage: router.get('/protected', authenticate, handler)
 */
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    try {
      const decoded = verifyAccessToken(token);
      req.user = decoded; // Attach decoded payload to request
      next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid token" });
      }
      throw err;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * Middleware to check if user has specific role
 * Usage: router.get('/admin', authenticate, requireRole('admin'), handler)
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

/**
 * Optional authentication - attaches user if token is valid, but doesn't fail if missing
 * Usage: router.get('/public', optionalAuth, handler)
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
      } catch (err) {
        // Token invalid or expired, but we don't block the request
        req.user = null;
      }
    }

    next();
  } catch (e) {
    next();
  }
}


