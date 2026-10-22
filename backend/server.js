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

// Seed the first story without resetting existing data
async function seedInitialStory() {
  await Story.updateOne(
    { slug: initialStory.slug },
    { $setOnInsert: initialStory },
    { upsert: true }
  );

  console.log("Initial story is ready");
}

// Welcome route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the TWISTED API",
  });
});

// Health check
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

// Get all stories
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

// Get one story and its vote totals
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

// Submit a vote
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

    // Atomic update: one vote per voter ID per story
    const updatedStory = await Story.findOneAndUpdate(
      {
        _id: story._id,
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
        message: "You have already voted on this story",
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

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Connect to MongoDB and start the API
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