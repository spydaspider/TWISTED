
const crypto = require("crypto");
const User = require("../models/User");

const COOKIE_NAME = "twisted_reader_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

function getSessionSecret() {
  const secret = process.env.READER_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "READER_SESSION_SECRET must be set and contain at least 32 characters."
    );
  }

  return secret;
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function createSessionToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user._id.toString(),
      ver: user.sessionVersion,
      exp: Math.floor(Date.now() / 1000) +
        Math.floor(SESSION_DURATION / 1000),
    })
  ).toString("base64url");

  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;

  try {
    const expectedSignature = signPayload(payload);

    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (
      !decoded.sub ||
      typeof decoded.exp !== "number" ||
      decoded.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}

function getCookieValue(req, cookieName) {
  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function setReaderCookie(res, user) {
  const token = createSessionToken(user);

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

function clearReaderCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}

async function requireReader(req, res, next) {
  try {
    const token = getCookieValue(req, COOKIE_NAME);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Please log in to vote.",
      });
    }

    const session = verifySessionToken(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
      });
    }

    const user = await User.findById(session.sub);

    if (
      !user ||
      !user.isActive ||
      user.sessionVersion !== session.ver
    ) {
      return res.status(401).json({
        success: false,
        message: "Your session is no longer valid. Please log in again.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Reader authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Authentication failed.",
    });
  }
}

module.exports = {
  COOKIE_NAME,
  requireReader,
  setReaderCookie,
  clearReaderCookie,
};
