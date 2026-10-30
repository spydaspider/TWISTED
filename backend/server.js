
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Story = require("./models/Story");
const episodeRoutes = require("./routes/episodeRoutes");

const {
  isAdmin,
  setAdminCookie,
  clearAdminCookie,
  verifyAdminSecret,
} = require("./middleware/adminAuth");

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================
// MIDDLEWARE
// =====================================

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "50kb" }));

// =====================================
// ADMIN REQUEST AUTHENTICATION
// Used by the existing voting-management
// routes. Supports both browser cookies
// and the Postman admin-secret header.
// =====================================

function requireAdminRequest(req, res) {
  if (isAdmin(req)) {
    return true;
  }

  res.status(
    process.env.ADMIN_SECRET ? 401 : 503
  ).json({
    success: false,
    message: process.env.ADMIN_SECRET
      ? "Unauthorized"
      : "ADMIN_SECRET is not configured",
  });

  return false;
}

// =====================================
// ADMIN LOGIN
// POST /api/admin/login
// =====================================

app.post("/api/admin/login", (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_SECRET) {
    return res.status(503).json({
      success: false,
      message: "ADMIN_SECRET is not configured",
    });
  }

  if (!verifyAdminSecret(secret)) {
    return res.status(401).json({
      success: false,
      message: "Incorrect admin password.",
    });
  }

  setAdminCookie(res, process.env.ADMIN_SECRET);

  return res.json({
    success: true,
    message: "Admin login successful.",
  });
});

// =====================================
// CHECK ADMIN SESSION
// GET /api/admin/session
// =====================================

app.get("/api/admin/session", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Admin session expired.",
    });
  }

  return res.json({
    success: true,
    authenticated: true,
  });
});

// =====================================
// ADMIN LOGOUT
// POST /api/admin/logout
// =====================================

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res);

  return res.json({
    success: true,
    message: "Logged out successfully.",
  });
});

// =====================================
// ADMIN EPISODE ROUTES
// =====================================

app.use("/api/admin", episodeRoutes);

// =====================================
// INITIAL STORY
// =====================================

const initialStory = {
  slug: "the-message",
  title: "THE MESSAGE",
  genre: "Psychological Thriller",
  episode: 1,
  status: "voting",

  description:
    "At 11:47 PM, a message arrives from an unknown number: I'm you. Three days from now.",

  choices: [
    {
      id: "open",
      title: "Open the door",
      votes: 0,
    },
    {
      id: "reply",
      title: "Reply to the message",
      votes: 0,
    },
    {
      id: "keyhole",
      title: "Look through the keyhole",
      votes: 0,
    },
  ],
};

// =====================================
// PUBLIC STORY FORMAT
// =====================================

function publicStory(story) {
  const result = story.toObject
    ? story.toObject()
    : { ...story };

  delete result.voters;
  delete result.runoffVoters;

  return {
    ...result,
    id: result.slug,
  };
}

// =====================================
// DATABASE SEEDING
// Does not overwrite existing stories.
// =====================================

async function seedInitialStory() {
  await Story.updateOne(
    { slug: initialStory.slug },
    {
      $setOnInsert: initialStory,
    },
    {
      upsert: true,
    }
  );

  console.log("Initial story is ready");
}

// =====================================
// WELCOME ROUTE
// =====================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the TWISTED API",
  });
});

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "TWISTED backend is running",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// =====================================
// GET ALL PUBLIC STORIES
// Draft stories are hidden.
// =====================================

app.get("/api/stories", async (req, res) => {
  try {
    const stories = await Story.find({
      status: { $ne: "draft" },
    })
      .select("-voters -runoffVoters")
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.json({
      success: true,
      stories: stories.map((story) => ({
        ...story,
        id: story.slug,
      })),
    });

  } catch (error) {
    console.error(
      "Could not fetch stories:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not retrieve stories",
    });
  }
});

// =====================================
// GET ONE PUBLIC STORY
// Draft stories are hidden.
// =====================================

app.get("/api/stories/:slug", async (req, res) => {
  try {
    const story = await Story.findOne({
      slug: req.params.slug,
      status: { $ne: "draft" },
    })
      .select("-voters -runoffVoters")
      .lean();

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    return res.json({
      success: true,
      story: {
        ...story,
        id: story.slug,
      },
    });

  } catch (error) {
    console.error(
      "Could not fetch story:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not retrieve story",
    });
  }
});

// =====================================
// SUBMIT VOTE
// ORIGINAL ROUND OR ACTIVE RUNOFF
// =====================================

app.post("/api/stories/:slug/vote", async (req, res) => {
  try {
    const { choiceId, voterId } = req.body || {};

    if (
      typeof choiceId !== "string" ||
      typeof voterId !== "string" ||
      voterId.trim().length < 10 ||
      voterId.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid choiceId and voterId are required",
      });
    }

    const cleanVoterId = voterId.trim();

    const story = await Story.findOne({
      slug: req.params.slug,
      status: { $ne: "draft" },
    }).lean();

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    console.log("\n========== TWISTED VOTE DEBUG ==========");
    console.log("Story:", story.slug);
    console.log("Story ID:", story._id);
    console.log("Original status:", story.status);
    console.log("Runoff status:", story.runoffStatus);
    console.log("Choice ID:", choiceId);
    console.log("========================================\n");

    // =====================================
    // RUNOFF VOTING
    // =====================================

    if (story.runoffStatus === "voting") {
      const selectedChoice = (
        story.runoffChoices || []
      ).find(
        (choice) => choice.id === choiceId
      );

      if (!selectedChoice) {
        return res.status(400).json({
          success: false,
          message: "Invalid runoff choice",
        });
      }

      const updatedStory = await Story.findOneAndUpdate(
        {
          _id: story._id,
          runoffStatus: "voting",
          "runoffChoices.id": choiceId,
          runoffVoters: {
            $not: {
              $elemMatch: {
                voterId: cleanVoterId,
              },
            },
          },
        },
        {
          $push: {
            runoffVoters: {
              voterId: cleanVoterId,
              choiceId,
            },
          },
          $inc: {
            "runoffChoices.$[selected].votes": 1,
          },
        },
        {
          new: true,
          arrayFilters: [
            {
              "selected.id": choiceId,
            },
          ],
          runValidators: true,
        }
      );

      if (!updatedStory) {
        return res.status(409).json({
          success: false,
          message:
            "You have already voted in this runoff, or runoff voting has closed",
        });
      }

      console.log(
        "Successful runoff vote:",
        cleanVoterId,
        choiceId
      );

      return res.json({
        success: true,
        message: "Your runoff vote has been recorded",
        round: "runoff",
        story: publicStory(updatedStory),
      });
    }

    // =====================================
    // ORIGINAL VOTING
    // =====================================

    if (story.status !== "voting") {
      return res.status(409).json({
        success: false,
        message: "Original voting is closed",
      });
    }

    const selectedChoice = (
      story.choices || []
    ).find(
      (choice) => choice.id === choiceId
    );

    if (!selectedChoice) {
      return res.status(400).json({
        success: false,
        message: "Invalid voting choice",
      });
    }

    const updatedStory = await Story.findOneAndUpdate(
      {
        _id: story._id,
        status: "voting",
        "choices.id": choiceId,
        voters: {
          $not: {
            $elemMatch: {
              voterId: cleanVoterId,
            },
          },
        },
      },
      {
        $push: {
          voters: {
            voterId: cleanVoterId,
            choiceId,
          },
        },
        $inc: {
          "choices.$[selected].votes": 1,
        },
      },
      {
        new: true,
        arrayFilters: [
          {
            "selected.id": choiceId,
          },
        ],
        runValidators: true,
      }
    );

    if (!updatedStory) {
      return res.status(409).json({
        success: false,
        message:
          "You have already voted, or original voting has closed",
      });
    }

    console.log(
      "Successful original vote:",
      cleanVoterId,
      choiceId
    );

    return res.json({
      success: true,
      message: "Your vote has been recorded",
      round: "original",
      story: publicStory(updatedStory),
    });

  } catch (error) {
    console.error(
      "Could not submit vote:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not submit your vote",
      error: error.message,
    });
  }
});

// =====================================
// CLOSE ORIGINAL VOTING
// =====================================

app.post(
  "/api/stories/:slug/close-voting",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const story = await Story.findOne({
        slug: req.params.slug,
      });

      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      if (story.status !== "voting") {
        return res.status(409).json({
          success: false,
          message: "Original voting is already closed",
        });
      }

      const totalVotes = story.choices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      if (totalVotes === 0) {
        return res.status(400).json({
          success: false,
          message:
            "At least one vote is required before closing",
        });
      }

      const highestVoteCount = Math.max(
        ...story.choices.map(
          (choice) => choice.votes
        )
      );

      const topChoices = story.choices.filter(
        (choice) => choice.votes === highestVoteCount
      );

      story.winningChoiceId =
        topChoices.length === 1
          ? topChoices[0].id
          : null;

      story.tiedChoiceIds =
        topChoices.length > 1
          ? topChoices.map(
              (choice) => choice.id
            )
          : [];

      story.status = "completed";

      await story.save();

      return res.json({
        success: true,

        message:
          topChoices.length === 1
            ? "Voting closed. The winning choice has been selected."
            : "Voting closed. The result is a tie.",

        totalVotes,

        winningChoice:
          topChoices.length === 1
            ? {
                id: topChoices[0].id,
                title: topChoices[0].title,
                votes: topChoices[0].votes,
              }
            : null,

        tiedChoices:
          topChoices.length > 1
            ? topChoices.map((choice) => ({
                id: choice.id,
                title: choice.title,
                votes: choice.votes,
              }))
            : [],

        story: publicStory(story),
      });

    } catch (error) {
      console.error(
        "Could not close voting:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not close voting",
      });
    }
  }
);

// =====================================
// START RUNOFF
// =====================================

app.post(
  "/api/stories/:slug/runoff/start",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const story = await Story.findOne({
        slug: req.params.slug,
      });

      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      if (story.status !== "completed") {
        return res.status(400).json({
          success: false,
          message:
            "Close the original voting round first",
        });
      }

      if (story.runoffStatus !== "not_started") {
        return res.status(409).json({
          success: false,
          message:
            "The runoff has already been started or completed",
        });
      }

      if (
        !story.tiedChoiceIds ||
        story.tiedChoiceIds.length < 2
      ) {
        return res.status(400).json({
          success: false,
          message: "There is no tie to resolve",
        });
      }

      const tiedChoices = story.choices.filter(
        (choice) =>
          story.tiedChoiceIds.includes(choice.id)
      );

      if (tiedChoices.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Could not find the tied choices",
        });
      }

      story.runoffChoices = tiedChoices.map(
        (choice) => ({
          id: choice.id,
          title: choice.title,
          votes: 0,
        })
      );

      story.runoffVoters = [];
      story.runoffWinningChoiceId = null;
      story.runoffTiedChoiceIds = [];
      story.runoffStatus = "voting";

      await story.save();

      return res.json({
        success: true,
        message: "Runoff voting has started",
        runoffChoices: story.runoffChoices,
        story: publicStory(story),
      });

    } catch (error) {
      console.error(
        "Could not start runoff:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not start runoff voting",
      });
    }
  }
);

// =====================================
// CLOSE RUNOFF
// =====================================

app.post(
  "/api/stories/:slug/runoff/close",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const story = await Story.findOne({
        slug: req.params.slug,
      });

      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found",
        });
      }

      if (story.runoffStatus !== "voting") {
        return res.status(409).json({
          success: false,
          message: "There is no active runoff to close",
        });
      }

      const totalVotes = story.runoffChoices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      if (totalVotes === 0) {
        return res.status(400).json({
          success: false,
          message:
            "At least one runoff vote is required",
        });
      }

      const highestVoteCount = Math.max(
        ...story.runoffChoices.map(
          (choice) => choice.votes
        )
      );

      const topChoices = story.runoffChoices.filter(
        (choice) => choice.votes === highestVoteCount
      );

      story.runoffWinningChoiceId =
        topChoices.length === 1
          ? topChoices[0].id
          : null;

      story.runoffTiedChoiceIds =
        topChoices.length > 1
          ? topChoices.map(
              (choice) => choice.id
            )
          : [];

      story.runoffStatus = "completed";

      await story.save();

      return res.json({
        success: true,

        message:
          topChoices.length === 1
            ? "Runoff closed. The official story direction has been selected."
            : "The runoff also ended in a tie. Another tie-resolution step is needed.",

        totalVotes,

        winningChoice:
          topChoices.length === 1
            ? {
                id: topChoices[0].id,
                title: topChoices[0].title,
                votes: topChoices[0].votes,
              }
            : null,

        tiedChoices:
          topChoices.length > 1
            ? topChoices.map((choice) => ({
                id: choice.id,
                title: choice.title,
                votes: choice.votes,
              }))
            : [],

        story: publicStory(story),
      });

    } catch (error) {
      console.error(
        "Could not close runoff:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not close runoff",
      });
    }
  }
);

// =====================================
// UNKNOWN ROUTES
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// =====================================
// CONNECT TO MONGODB AND START API
// =====================================

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error(
        "MONGO_URI is missing from backend/.env"
      );
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully");

    await seedInitialStory();

    app.listen(PORT, () => {
      console.log(
        `TWISTED API running at http://localhost:${PORT}`
      );
    });

  } catch (error) {
    console.error(
      "Failed to start TWISTED:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
