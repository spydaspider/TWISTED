const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    votes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const voterSchema = new mongoose.Schema(
  {
    voterId: { type: String, required: true },
    choiceId: { type: String, required: true },
  },
  { _id: false }
);

const storySchema = new mongoose.Schema(
  {
    // Story identification
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Groups episodes belonging to the same continuing story.
    seriesSlug: {
      type: String,
      index: true,
    },

    // Links this episode to the previous episode.
    previousEpisodeSlug: {
      type: String,
      default: null,
    },

    // Records the winning choice that inspired this episode.
    basedOnChoiceId: {
      type: String,
      default: null,
    },

    basedOnChoiceTitle: {
      type: String,
      default: null,
    },

    title: {
      type: String,
      required: true,
    },

    genre: {
      type: String,
      required: true,
    },

    episode: {
      type: Number,
      default: 1,
      min: 1,
    },

    // "draft" means unpublished; "voting" means published and open;
    // "completed" means the voting round has closed.
    status: {
      type: String,
      enum: ["draft", "voting", "completed"],
      default: "draft",
    },

    // Short summary shown to readers.
    description: {
      type: String,
      required: true,
    },

    // Full story text for the episode.
    content: {
      type: String,
      default: "",
    },

    // Original voting round.
    choices: {
      type: [choiceSchema],
      default: [],
    },

    voters: {
      type: [voterSchema],
      default: [],
    },

    winningChoiceId: {
      type: String,
      default: null,
    },

    tiedChoiceIds: {
      type: [String],
      default: [],
    },

    // Separate runoff round.
    runoffStatus: {
      type: String,
      enum: ["not_started", "voting", "completed"],
      default: "not_started",
    },

    runoffChoices: {
      type: [choiceSchema],
      default: [],
    },

    runoffVoters: {
      type: [voterSchema],
      default: [],
    },

    runoffWinningChoiceId: {
      type: String,
      default: null,
    },

    runoffTiedChoiceIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Story", storySchema);