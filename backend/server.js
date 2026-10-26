require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Story = require("./models/Story");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
  })
);

app.use(express.json({ limit: "10kb" }));

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

// Seed the first story without resetting existing data.
async function seedInitialStory() {
  await Story.updateOne(
    { slug: initialStory.slug },
    { $setOnInsert: initialStory },
    { upsert: true }
  );

  console.log("Initial story is ready");
}

// Welcome route.
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the TWISTED API",
  });
});

// Health check.
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

// Get all stories.
app.get("/api/stories", async (req, res) => {
  try {
    const stories = await Story.find()
      .select("-voters")
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

// Get one story and its vote totals.
app.get("/api/stories/:slug", async (req, res) => {
  try {
    const story = await Story.findOne({
      slug: req.params.slug,
    })
      .select("-voters")
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

// Submit a vote.
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

    // Atomic update: one vote per voter ID per story.
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
        arrayFilters: [{ "selected.id": choiceId }],
        runValidators: true,
      }
    ).select("-voters");

    if (!updatedStory) {
      return res.status(409).json({
        success: false,
        message:
          "You have already voted, or voting has closed",
      });
    }

    res.json({
      success: true,
      message: "Your vote has been recorded",
      story: {
        ...updatedStory.toObject(),
        id: updatedStory.slug,
      },
    });
  } catch (error) {
    console.error("Could not submit vote:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not submit your vote",
    });
  }
});

// Close voting and calculate the winning choice.
// DEVELOPMENT ADMIN ENDPOINT: protect this with ADMIN_SECRET.
app.post(
  "/api/stories/:slug/close-voting",
  async (req, res) => {
    try {
      const adminSecret = process.env.ADMIN_SECRET;

      if (!adminSecret) {
        return res.status(503).json({
          success: false,
          message: "ADMIN_SECRET is not configured",
        });
      }

      const providedSecret = req.get("x-admin-secret");

      if (providedSecret !== adminSecret) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
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

      if (story.status === "completed") {
        return res.status(409).json({
          success: false,
          message: "Voting has already been closed",
          winningChoiceId: story.winningChoiceId,
          tiedChoiceIds: story.tiedChoiceIds,
        });
      }

      if (story.status !== "voting") {
        return res.status(400).json({
          success: false,
          message: "This story is not currently accepting votes",
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

      // A single leader becomes the winner.
      // Multiple leaders are stored as a tie.
      story.winningChoiceId =
        topChoices.length === 1 ? topChoices[0].id : null;

      story.tiedChoiceIds =
        topChoices.length > 1
          ? topChoices.map((choice) => choice.id)
          : [];

      story.status = "completed";

      await story.save();

      res.json({
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
        story: {
          ...story.toObject(),
          id: story.slug,
        },
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

// Unknown routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Connect to MongoDB and start the API.
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");

    await seedInitialStory();

    app.listen(PORT, () => {
      console.log(`TWISTED API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start TWISTED:", error.message);
    process.exit(1);
  }
}

startServer();