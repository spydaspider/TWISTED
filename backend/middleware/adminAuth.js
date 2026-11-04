
const crypto = require("crypto");

const COOKIE_NAME = "twisted_admin_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

// =====================================
// Timing-safe comparison
// =====================================

function safeCompare(first, second) {
  if (
    typeof first !== "string" ||
    typeof second !== "string"
  ) {
    return false;
  }

  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer)
  );
}

// =====================================
// Admin request protection
// =====================================

// Check whether the request uses the Postman admin secret.
function isAdminSecretRequest(req) {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.get("x-admin-secret");

  if (!adminSecret || !providedSecret) {
    return false;
  }

  return safeCompare(providedSecret, adminSecret);
}

// Check for the special Admin Studio request header.
function hasAdminActionHeader(req) {
  return req.get("X-Twisted-Admin-Action") === "1";
}

// Identify requests that change data.
function requiresAdminActionProtection(req) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(
    req.method
  );
}

// =====================================
// Session creation
// =====================================

function createSignature(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function createSession(secret) {
  const expiresAt = Date.now() + SESSION_DURATION;
  const payload = String(expiresAt);
  const signature = createSignature(payload, secret);

  return `${payload}.${signature}`;
}

// =====================================
// Cookie handling
// =====================================

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}

// =====================================
// Session verification
// =====================================

function isValidSession(req) {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) return false;

  const session = getCookie(req, COOKIE_NAME);

  if (!session) return false;

  const parts = session.split(".");

  if (parts.length !== 2) return false;

  const [payload, suppliedSignature] = parts;
  const expiresAt = Number(payload);

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return false;
  }

  const expectedSignature = createSignature(
    payload,
    secret
  );

  return safeCompare(
    suppliedSignature,
    expectedSignature
  );
}

// =====================================
// Admin authentication
// =====================================

function isAdmin(req) {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) return false;

  // Postman/API testing authentication.
  if (isAdminSecretRequest(req)) {
    return true;
  }

  // Browser dashboard authentication.
  return isValidSession(req);
}

// =====================================
// Admin authorization middleware
// =====================================

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_SECRET) {
    return res.status(503).json({
      success: false,
      message: "ADMIN_SECRET is not configured.",
    });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Your admin session is invalid or has expired.",
    });
  }

  // Browser-based state-changing requests must include
  // the special protection header.
  //
  // Postman requests using x-admin-secret are exempt.
  if (
    requiresAdminActionProtection(req) &&
    !isAdminSecretRequest(req) &&
    !hasAdminActionHeader(req)
  ) {
    return res.status(403).json({
      success: false,
      message: "Missing admin request protection header.",
    });
  }

  next();
}

// =====================================
// Admin cookie creation
// =====================================

function setAdminCookie(res, secret) {
  const session = createSession(secret);

  res.cookie(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_DURATION,
  });
}

// =====================================
// Admin cookie removal
// =====================================

function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

// =====================================
// Verify admin secret
// =====================================

function verifyAdminSecret(suppliedSecret) {
  return safeCompare(
    suppliedSecret,
    process.env.ADMIN_SECRET
  );
}

// =====================================
// Exports
// =====================================

module.exports = {
  requireAdmin,
  isAdmin,
  isAdminSecretRequest,
  hasAdminActionHeader,
  requiresAdminActionProtection,
  setAdminCookie,
  clearAdminCookie,
  verifyAdminSecret,
};
