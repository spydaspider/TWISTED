const mongoose = require("mongoose");

const choiceSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    votes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const voterSchema = new mongoose.Schema(
  {
    voterId: {
      type: String,
      required: true,
    },
    choiceId: {
      type: String,
      required: true,
    },
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
    },
    status: {
      type: String,
      enum: ["draft", "voting", "completed"],
      default: "voting",
    },
    description: {
      type: String,
      required: true,
    },
    choices: {
      type: [choiceSchema],
      default: [],
    },
    voters: {
      type: [voterSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Story", storySchema);