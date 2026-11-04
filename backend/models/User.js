
const mongoose = require("mongoose");
const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      unique: true,
      match: /^[a-zA-Z0-9_]+$/,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    passwordSalt: {
      type: String,
      required: true,
      select: false,
    },

    profileImageUrl: {
      type: String,
      default: "",
      maxlength: 500,
    },

    bio: {
      type: String,
      default: "",
      maxlength: 300,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sessionVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

userSchema.statics.createPasswordCredentials = async function (password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);

  return {
    passwordSalt: salt,
    passwordHash: derivedKey.toString("hex"),
  };
};

userSchema.methods.verifyPassword = async function (password) {
  const derivedKey = await scryptAsync(
    password,
    this.passwordSalt,
    64
  );

  const storedHash = Buffer.from(this.passwordHash, "hex");
  const suppliedHash = Buffer.from(derivedKey.toString("hex"), "hex");

  if (storedHash.length !== suppliedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedHash, suppliedHash);
};

module.exports = mongoose.model("User", userSchema);
