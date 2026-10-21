require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

// API welcome route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the TWISTED API",
  });
});

// Backend health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "TWISTED backend is running",
  });
});

// Initial story data
app.get("/api/stories", (req, res) => {
  res.json({
    success: true,
    stories: [
      {
        id: "the-message",
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
          },
          {
            id: "reply",
            title: "Reply to the message",
          },
          {
            id: "keyhole",
            title: "Look through the keyhole",
          },
        ],
      },
    ],
  });
});

// Handle unknown API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.listen(PORT, () => {
  console.log(`TWISTED API running at http://localhost:${PORT}`);
});