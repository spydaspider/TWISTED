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
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, required: true },
    genre: { type: String, required: true },
    episode: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["draft", "voting", "completed"],
      default: "voting",
    },
    description: { type: String, required: true },

    // Original voting round.
    choices: { type: [choiceSchema], default: [] },
    voters: { type: [voterSchema], default: [] },
    winningChoiceId: { type: String, default: null },
    tiedChoiceIds: { type: [String], default: [] },

    // Separate runoff round, preserving the original votes.
    runoffStatus: {
      type: String,
      enum: ["not_started", "voting", "completed"],
      default: "not_started",
    },
    runoffChoices: { type: [choiceSchema], default: [] },
    runoffVoters: { type: [voterSchema], default: [] },
    runoffWinningChoiceId: { type: String, default: null },
    runoffTiedChoiceIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", storySchema);