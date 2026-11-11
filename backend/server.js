
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Story = require("./models/Story");
const episodeRoutes = require("./routes/episodeRoutes");
const authRoutes = require("./routes/authRoutes");

const { requireReader } = require("./middleware/readerAuth");

const {
  isAdmin,
  isAdminSecretRequest,
  hasAdminActionHeader,
  requiresAdminActionProtection,
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
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "X-Twisted-Admin-Action",
      "X-Admin-Secret",
    ],
  })
);

app.use(express.json({ limit: "50kb" }));

// =====================================
// ADMIN REQUEST AUTHENTICATION
// =====================================

function requireAdminRequest(req, res) {
  if (!process.env.ADMIN_SECRET) {
    res.status(503).json({
      success: false,
      message: "ADMIN_SECRET is not configured.",
    });

    return false;
  }

  if (!isAdmin(req)) {
    res.status(401).json({
      success: false,
      message: "Your admin session is invalid or has expired.",
    });

    return false;
  }

  if (
    requiresAdminActionProtection(req) &&
    !isAdminSecretRequest(req) &&
    !hasAdminActionHeader(req)
  ) {
    res.status(403).json({
      success: false,
      message: "Missing admin request protection header.",
    });

    return false;
  }

  return true;
}

// =====================================
// ADMIN LOGIN
// =====================================

app.post("/api/admin/login", (req, res) => {
  const { secret } = req.body || {};

  if (!process.env.ADMIN_SECRET) {
    return res.status(503).json({
      success: false,
      message: "ADMIN_SECRET is not configured.",
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
// =====================================

app.post("/api/admin/logout", (req, res) => {
  if (!requireAdminRequest(req, res)) {
    return;
  }

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
// READER AUTHENTICATION ROUTES
// =====================================

app.use("/api/auth", authRoutes);

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
// ATOMIC VOTING RESULT CALCULATION
// =====================================

function buildVotingClosePipeline(
  choicesField,
  statusField,
  winnerField,
  tiedField
) {
  const choicesPath = `$${choicesField}`;

  const maxVotes = {
    $max: {
      $map: {
        input: choicesPath,
        as: "choice",
        in: {
          $ifNull: ["$$choice.votes", 0],
        },
      },
    },
  };

  const topChoices = {
    $filter: {
      input: choicesPath,
      as: "choice",
      cond: {
        $eq: [
          { $ifNull: ["$$choice.votes", 0] },
          maxVotes,
        ],
      },
    },
  };

  const topChoiceIds = {
    $map: {
      input: topChoices,
      as: "choice",
      in: "$$choice.id",
    },
  };

  return [
    {
      $set: {
        [statusField]: "completed",

        [winnerField]: {
          $cond: [
            { $eq: [{ $size: topChoices }, 1] },
            { $arrayElemAt: [topChoiceIds, 0] },
            null,
          ],
        },

        [tiedField]: {
          $cond: [
            { $gt: [{ $size: topChoices }, 1] },
            topChoiceIds,
            [],
          ],
        },
      },
    },
  ];
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
    console.error("Could not fetch stories:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve stories.",
    });
  }
});

// =====================================
// GET ONE PUBLIC STORY
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
        message: "Story not found.",
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
    console.error("Could not fetch story:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve story.",
    });
  }
});

// =====================================
// SUBMIT VOTE
// ORIGINAL ROUND OR ACTIVE RUNOFF
// =====================================

app.post(
  "/api/stories/:slug/vote",
  requireReader,
  async (req, res) => {
    try {
      const { choiceId } = req.body || {};

      if (
        typeof choiceId !== "string" ||
        !choiceId.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid choiceId is required.",
        });
      }

      const cleanVoterId = req.user._id.toString();

      const story = await Story.findOne({
        slug: req.params.slug,
        status: { $ne: "draft" },
      }).lean();

      if (!story) {
        return res.status(404).json({
          success: false,
          message: "Story not found.",
        });
      }

      // =====================================
      // RUNOFF VOTING
      // =====================================

      if (story.runoffStatus === "voting") {
        const selectedChoice = (
          story.runoffChoices || []
        ).find((choice) => choice.id === choiceId);

        if (!selectedChoice) {
          return res.status(400).json({
            success: false,
            message: "Invalid runoff choice.",
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
              "You have already voted in this runoff, or runoff voting has closed.",
          });
        }

        console.log(
          "Successful runoff vote:",
          cleanVoterId,
          choiceId
        );

        return res.json({
          success: true,
          message: "Your runoff vote has been recorded.",
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
          message: "Original voting is closed.",
        });
      }

      const selectedChoice = (
        story.choices || []
      ).find((choice) => choice.id === choiceId);

      if (!selectedChoice) {
        return res.status(400).json({
          success: false,
          message: "Invalid voting choice.",
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
            "You have already voted, or original voting has closed.",
        });
      }

      console.log(
        "Successful original vote:",
        cleanVoterId,
        choiceId
      );

      return res.json({
        success: true,
        message: "Your vote has been recorded.",
        round: "original",
        story: publicStory(updatedStory),
      });
    } catch (error) {
      console.error("Could not submit vote:", error);

      return res.status(500).json({
        success: false,
        message: "Could not submit your vote.",
      });
    }
  }
);

// =====================================
// CLOSE ORIGINAL VOTING
// ATOMIC UPDATE
// =====================================

app.post(
  "/api/stories/:slug/close-voting",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const currentStory = await Story.findOne({
        slug: req.params.slug,
      })
        .select("status choices")
        .lean();

      if (!currentStory) {
        return res.status(404).json({
          success: false,
          message: "Story not found.",
        });
      }

      if (currentStory.status !== "voting") {
        return res.status(409).json({
          success: false,
          message: "Original voting is already closed.",
        });
      }

      const currentTotal = currentStory.choices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      if (currentTotal === 0) {
        return res.status(400).json({
          success: false,
          message:
            "At least one vote is required before closing.",
        });
      }

      // Mongoose requires updatePipeline: true
      // when the update argument is an aggregation pipeline.

      const story = await Story.findOneAndUpdate(
        {
          slug: req.params.slug,
          status: "voting",
        },
        buildVotingClosePipeline(
          "choices",
          "status",
          "winningChoiceId",
          "tiedChoiceIds"
        ),
        {
          new: true,
          updatePipeline: true,
        }
      );

      if (!story) {
        return res.status(409).json({
          success: false,
          message: "Voting has already been closed.",
        });
      }

      const totalVotes = story.choices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      const winningChoice = story.winningChoiceId
        ? story.choices.find(
            (choice) => choice.id === story.winningChoiceId
          )
        : null;

      const tiedChoices = story.choices.filter(
        (choice) => story.tiedChoiceIds.includes(choice.id)
      );

      return res.json({
        success: true,

        message: winningChoice
          ? "Voting closed. The winning choice has been selected."
          : "Voting closed. The result is a tie.",

        totalVotes,

        winningChoice: winningChoice
          ? {
              id: winningChoice.id,
              title: winningChoice.title,
              votes: winningChoice.votes,
            }
          : null,

        tiedChoices: tiedChoices.map((choice) => ({
          id: choice.id,
          title: choice.title,
          votes: choice.votes,
        })),

        story: publicStory(story),
      });
    } catch (error) {
      console.error("Could not close voting:", error);

      return res.status(500).json({
        success: false,
        message: "Could not close voting.",
      });
    }
  }
);

// =====================================
// START RUNOFF
// ATOMIC UPDATE
// =====================================

app.post(
  "/api/stories/:slug/runoff/start",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const currentStory = await Story.findOne({
        slug: req.params.slug,
      })
        .select(
          "status runoffStatus tiedChoiceIds choices"
        )
        .lean();

      if (!currentStory) {
        return res.status(404).json({
          success: false,
          message: "Story not found.",
        });
      }

      if (currentStory.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: "Close the original voting round first.",
        });
      }

      if (currentStory.runoffStatus !== "not_started") {
        return res.status(409).json({
          success: false,
          message:
            "The runoff has already been started or completed.",
        });
      }

      if (
        !currentStory.tiedChoiceIds ||
        currentStory.tiedChoiceIds.length < 2
      ) {
        return res.status(400).json({
          success: false,
          message: "There is no tie to resolve.",
        });
      }

      const tiedChoices = currentStory.choices.filter(
        (choice) =>
          currentStory.tiedChoiceIds.includes(choice.id)
      );

      if (tiedChoices.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Could not find the tied choices.",
        });
      }

      // Build runoff choices from the original tied choices.

      const runoffChoicesExpression = {
        $map: {
          input: {
            $filter: {
              input: "$choices",
              as: "choice",
              cond: {
                $in: [
                  "$$choice.id",
                  { $ifNull: ["$tiedChoiceIds", []] },
                ],
              },
            },
          },
          as: "choice",
          in: {
            id: "$$choice.id",
            title: "$$choice.title",
            votes: 0,
          },
        },
      };

      // Only one request can change not_started to voting.

      const story = await Story.findOneAndUpdate(
        {
          slug: req.params.slug,
          status: "completed",
          runoffStatus: "not_started",
          "tiedChoiceIds.1": { $exists: true },
        },
        [
          {
            $set: {
              runoffChoices: runoffChoicesExpression,
              runoffVoters: [],
              runoffWinningChoiceId: null,
              runoffTiedChoiceIds: [],
              runoffStatus: "voting",
            },
          },
        ],
        {
          new: true,
          updatePipeline: true,
        }
      );

      if (!story) {
        return res.status(409).json({
          success: false,
          message: "The runoff has already been started.",
        });
      }

      return res.json({
        success: true,
        message: "Runoff voting has started.",
        runoffChoices: story.runoffChoices,
        story: publicStory(story),
      });
    } catch (error) {
      console.error("Could not start runoff:", error);

      return res.status(500).json({
        success: false,
        message: "Could not start runoff voting.",
      });
    }
  }
);

// =====================================
// CLOSE RUNOFF
// ATOMIC UPDATE
// =====================================

app.post(
  "/api/stories/:slug/runoff/close",
  async (req, res) => {
    try {
      if (!requireAdminRequest(req, res)) {
        return;
      }

      const currentStory = await Story.findOne({
        slug: req.params.slug,
      })
        .select("runoffStatus runoffChoices")
        .lean();

      if (!currentStory) {
        return res.status(404).json({
          success: false,
          message: "Story not found.",
        });
      }

      if (currentStory.runoffStatus !== "voting") {
        return res.status(409).json({
          success: false,
          message: "There is no active runoff to close.",
        });
      }

      const currentTotal = currentStory.runoffChoices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      if (currentTotal === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one runoff vote is required.",
        });
      }

      const story = await Story.findOneAndUpdate(
        {
          slug: req.params.slug,
          runoffStatus: "voting",
        },
        buildVotingClosePipeline(
          "runoffChoices",
          "runoffStatus",
          "runoffWinningChoiceId",
          "runoffTiedChoiceIds"
        ),
        {
          new: true,
          updatePipeline: true,
        }
      );

      if (!story) {
        return res.status(409).json({
          success: false,
          message: "Runoff voting has already been closed.",
        });
      }

      const totalVotes = story.runoffChoices.reduce(
        (total, choice) => total + choice.votes,
        0
      );

      const winningChoice = story.runoffWinningChoiceId
        ? story.runoffChoices.find(
            (choice) =>
              choice.id === story.runoffWinningChoiceId
          )
        : null;

      const tiedChoices = story.runoffChoices.filter(
        (choice) =>
          story.runoffTiedChoiceIds.includes(choice.id)
      );

      return res.json({
        success: true,

        message: winningChoice
          ? "Runoff closed. The official story direction has been selected."
          : "The runoff also ended in a tie. Another tie-resolution step is needed.",

        totalVotes,

        winningChoice: winningChoice
          ? {
              id: winningChoice.id,
              title: winningChoice.title,
              votes: winningChoice.votes,
            }
          : null,

        tiedChoices: tiedChoices.map((choice) => ({
          id: choice.id,
          title: choice.title,
          votes: choice.votes,
        })),

        story: publicStory(story),
      });
    } catch (error) {
      console.error("Could not close runoff:", error);

      return res.status(500).json({
        success: false,
        message: "Could not close runoff.",
      });
    }
  }
);

// =====================================
// CREATE A NEW STORY / SERIES
// ADMIN ONLY
// =====================================

app.post("/api/admin/stories", async (req, res) => {
  try {
    if (!requireAdminRequest(req, res)) {
      return;
    }

    const {
      title,
      genre,
      description,
      content,
      plannedEpisodes = 8,
      choices,
    } = req.body || {};

    // Validate required text fields.

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof genre !== "string" ||
      !genre.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, genre, description and opening episode content are required.",
      });
    }

    // Validate planned episode count.

    const episodeLimit = Number(plannedEpisodes);

    if (
      !Number.isInteger(episodeLimit) ||
      episodeLimit < 1 ||
      episodeLimit > 50
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Planned episodes must be a whole number between 1 and 50.",
      });
    }

    // Every new story must have exactly three choices.

    if (
      !Array.isArray(choices) ||
      choices.length !== 3 ||
      choices.some(
        (choice) =>
          typeof choice.title !== "string" ||
          !choice.title.trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A new story must have exactly three valid voting choices.",
      });
    }

    // Generate a URL-friendly slug from the title.

    const slugBase = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);

    if (!slugBase) {
      return res.status(400).json({
        success: false,
        message: "The story title cannot generate a valid slug.",
      });
    }

    // Make sure the slug is unique.

    let slug = slugBase;
    let counter = 2;

    while (await Story.exists({ slug })) {
      slug = `${slugBase}-${counter}`;
      counter++;
    }

    // Generate unique IDs for the three choices.

    const usedIds = new Set();

    const formattedChoices = choices.map((choice) => {
      const choiceBase =
        choice.title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "choice";

      let id = choiceBase;
      let choiceCounter = 2;

      while (usedIds.has(id)) {
        id = `${choiceBase}-${choiceCounter}`;
        choiceCounter++;
      }

      usedIds.add(id);

      return {
        id,
        title: choice.title.trim(),
        votes: 0,
      };
    });

    // Create the first episode and its independent series.

    const newStory = await Story.create({
      slug,

      seriesSlug: slug,

      title: title.trim(),
      genre: genre.trim(),

      episode: 1,
      plannedEpisodes: episodeLimit,

      isFinale: episodeLimit === 1,

      seriesCompleted: false,
      seriesCompletedAt: null,

      previousEpisodeSlug: null,
      basedOnChoiceId: null,
      basedOnChoiceTitle: null,

      description: description.trim(),
      content: content.trim(),

      status: "voting",

      choices: formattedChoices,

      voters: [],

      winningChoiceId: null,
      tiedChoiceIds: [],

      runoffStatus: "not_started",
      runoffChoices: [],
      runoffVoters: [],
      runoffWinningChoiceId: null,
      runoffTiedChoiceIds: [],
    });

    console.log("New TWISTED story created:", slug);

    return res.status(201).json({
      success: true,
      message: "New story created successfully. Episode 1 is now open for voting.",
      story: publicStory(newStory),
    });
  } catch (error) {
    console.error("Could not create new story:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A story with this slug already exists. Please try another title.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not create the new story.",
    });
  }
});

// =====================================
// UNKNOWN ROUTES
// =====================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
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
