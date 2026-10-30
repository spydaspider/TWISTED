
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Story = require("./models/Story");
const episodeRoutes = require("./routes/episodeRoutes");

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
  })
);

app.use(express.json({ limit: "10kb" }));

// AI episode generation, editing and publishing routes.
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
    { id: "open", title: "Open the door", votes: 0 },
    { id: "reply", title: "Reply to the message", votes: 0 },
    { id: "keyhole", title: "Look through the keyhole", votes: 0 },
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
// ADMIN AUTHENTICATION
// =====================================

function isAdmin(req) {
  const adminSecret = process.env.ADMIN_SECRET;

  return Boolean(
    adminSecret &&
    req.get("x-admin-secret") === adminSecret
  );
}

// =====================================
// INITIAL STORY SEEDING
// =====================================

async function seedInitialStory() {
  await Story.updateOne(
    { slug: initialStory.slug },
    { $setOnInsert: initialStory },
    { upsert: true }
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
// Drafts are hidden.
// =====================================

app.get("/api/stories", async (req, res) => {
  try {
    const stories = await Story.find({
      status: { $ne: "draft" },
    })
      .select("-voters -runoffVoters")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,

      stories: stories.map((story) => ({
        ...story,
        id: story.slug,
      })),
    });
  } catch (error) {
    console.error("Could not fetch stories:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not retrieve stories",
    });
  }
});

// =====================================
// GET ONE PUBLIC STORY
// Drafts are hidden.
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

    res.json({
      success: true,

      story: {
        ...story,
        id: story.slug,
      },
    });
  } catch (error) {
    console.error("Could not fetch story:", error.message);

    res.status(500).json({
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
    const { choiceId, voterId } = req.body;

    if (
      typeof choiceId !== "string" ||
      typeof voterId !== "string" ||
      voterId.length < 10 ||
      voterId.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid choiceId and voterId are required",
      });
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

    // RUNOFF VOTING

    if (story.runoffStatus === "voting") {
      const selectedChoice = story.runoffChoices.find(
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
          "runoffVoters.voterId": { $ne: voterId },
        },
        {
          $push: {
            runoffVoters: { voterId, choiceId },
          },

          $inc: {
            "runoffChoices.$[selected].votes": 1,
          },
        },
        {
          new: true,
          arrayFilters: [
            { "selected.id": choiceId },
          ],
          runValidators: true,
        }
      ).select("-voters -runoffVoters");

      if (!updatedStory) {
        return res.status(409).json({
          success: false,
          message:
            "You have already voted in this runoff, or runoff voting has closed",
        });
      }

      return res.json({
        success: true,
        message: "Your runoff vote has been recorded",
        round: "runoff",
        story: publicStory(updatedStory),
      });
    }

    // ORIGINAL VOTING ROUND

    if (story.status !== "voting") {
      return res.status(400).json({
        success: false,
        message: "Voting is closed for this story",
      });
    }

    const selectedChoice = story.choices.find(
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
        "voters.voterId": { $ne: voterId },
      },
      {
        $push: {
          voters: { voterId, choiceId },
        },

        $inc: {
          "choices.$[selected].votes": 1,
        },
      },
      {
        new: true,
        arrayFilters: [
          { "selected.id": choiceId },
        ],
        runValidators: true,
      }
    ).select("-voters -runoffVoters");

    if (!updatedStory) {
      return res.status(409).json({
        success: false,
        message:
          "You have already voted, or voting has closed",
      });
    }

    return res.json({
      success: true,
      message: "Your vote has been recorded",
      round: "original",
      story: publicStory(updatedStory),
    });
  } catch (error) {
    console.error("Could not submit vote:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not submit your vote",
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
      if (!isAdmin(req)) {
        return res.status(
          process.env.ADMIN_SECRET ? 401 : 503
        ).json({
          success: false,
          message: process.env.ADMIN_SECRET
            ? "Unauthorized"
            : "ADMIN_SECRET is not configured",
        });
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
          message: "At least one vote is required before closing",
        });
      }

      const highestVoteCount = Math.max(
        ...story.choices.map((choice) => choice.votes)
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
          ? topChoices.map((choice) => choice.id)
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
      console.error("Could not close voting:", error.message);

      res.status(500).json({
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
      if (!isAdmin(req)) {
        return res.status(
          process.env.ADMIN_SECRET ? 401 : 503
        ).json({
          success: false,
          message: process.env.ADMIN_SECRET
            ? "Unauthorized"
            : "ADMIN_SECRET is not configured",
        });
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
          message: "Close the original voting round first",
        });
      }

      if (story.runoffStatus !== "not_started") {
        return res.status(409).json({
          success: false,
          message: "The runoff has already been started or completed",
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

      story.runoffChoices = story.choices
        .filter((choice) =>
          story.tiedChoiceIds.includes(choice.id)
        )
        .map((choice) => ({
          id: choice.id,
          title: choice.title,
          votes: 0,
        }));

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
      console.error("Could not start runoff:", error.message);

      res.status(500).json({
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
      if (!isAdmin(req)) {
        return res.status(
          process.env.ADMIN_SECRET ? 401 : 503
        ).json({
          success: false,
          message: process.env.ADMIN_SECRET
            ? "Unauthorized"
            : "ADMIN_SECRET is not configured",
        });
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
          message: "At least one runoff vote is required",
        });
      }

      const highestVoteCount = Math.max(
        ...story.runoffChoices.map((choice) => choice.votes)
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
          ? topChoices.map((choice) => choice.id)
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
      console.error("Could not close runoff:", error.message);

      res.status(500).json({
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
