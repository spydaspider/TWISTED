
const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Story = require("../models/Story");

const {
  requireReader,
  setReaderCookie,
  clearReaderCookie,
} = require("../middleware/readerAuth");

const router = express.Router();

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    profileImageUrl: user.profileImageUrl || "",
    bio: user.bio || "",
    createdAt: user.createdAt,
  };
}

// =====================================
// REGISTER
// POST /api/auth/register
// =====================================

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required.",
      });
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 3–24 characters and contain only letters, numbers or underscores.",
      });
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 10 and 128 characters.",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: cleanEmail },
        { username: cleanUsername },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "That email address or username is already registered.",
      });
    }

    const credentials = await User.createPasswordCredentials(password);

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
    });

    setReaderCookie(res, user);

    return res.status(201).json({
      success: true,
      message: "Your TWISTED account has been created.",
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That email address or username is already registered.",
      });
    }

    console.error("Reader registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create your account right now.",
    });
  }
});

// =====================================
// LOGIN
// POST /api/auth/login
// =====================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash +passwordSalt");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordIsValid = await user.verifyPassword(password);

    if (!passwordIsValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    setReaderCookie(res, user);

    return res.status(200).json({
      success: true,
      message: "You are now logged in.",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Reader login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in right now.",
    });
  }
});

// =====================================
// CURRENT READER
// GET /api/auth/me
// =====================================

router.get("/me", requireReader, (req, res) => {
  return res.status(200).json({
    success: true,
    user: publicUser(req.user),
  });
});

// =====================================
// LOGOUT
// POST /api/auth/logout
// =====================================

router.post("/logout", (req, res) => {
  clearReaderCookie(res);

  return res.status(200).json({
    success: true,
    message: "You have been logged out.",
  });
});

// =====================================
// VOTING HISTORY
// GET /api/auth/voting-history
// =====================================

router.get("/voting-history", requireReader, async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const stories = await Story.find({
      $or: [
        { "voters.voterId": userId },
        { "runoffVoters.voterId": userId },
      ],
    })
      .select(
        "slug title genre episode status choices voters winningChoiceId runoffStatus runoffChoices runoffVoters runoffWinningChoiceId"
      )
      .lean();

    const history = [];

    for (const story of stories) {
      const originalVote = story.voters.find(
        (vote) => vote.voterId === userId
      );

      if (originalVote) {
        const selectedChoice = story.choices.find(
          (choice) => choice.id === originalVote.choiceId
        );

        const winningChoice = story.choices.find(
          (choice) => choice.id === story.winningChoiceId
        );

        history.push({
          round: "original",
          story: {
            slug: story.slug,
            title: story.title,
            genre: story.genre,
            episode: story.episode,
          },
          selectedChoice: selectedChoice
            ? selectedChoice.title
            : originalVote.choiceId,
          result:
            story.status !== "completed"
              ? "pending"
              : story.winningChoiceId === originalVote.choiceId
                ? "won"
                : "not_won",
          winningChoice: winningChoice
            ? winningChoice.title
            : null,
        });
      }

      const runoffVote = (story.runoffVoters || []).find(
        (vote) => vote.voterId === userId
      );

      if (runoffVote) {
        const selectedChoice = (story.runoffChoices || []).find(
          (choice) => choice.id === runoffVote.choiceId
        );

        const winningChoice = (story.runoffChoices || []).find(
          (choice) => choice.id === story.runoffWinningChoiceId
        );

        history.push({
          round: "runoff",
          story: {
            slug: story.slug,
            title: story.title,
            genre: story.genre,
            episode: story.episode,
          },
          selectedChoice: selectedChoice
            ? selectedChoice.title
            : runoffVote.choiceId,
          result:
            story.runoffStatus !== "completed"
              ? "pending"
              : story.runoffWinningChoiceId === runoffVote.choiceId
                ? "won"
                : "not_won",
          winningChoice: winningChoice
            ? winningChoice.title
            : null,
        });
      }
    }

    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error("Voting history error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your voting history.",
    });
  }
});

module.exports = router;
