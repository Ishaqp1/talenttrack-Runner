const express = require("express");
const cors = require("cors");
const { runHandler } = require("./run");

const app = express();

// CORS — allow localhost, GitHub Pages, and syedishaq.me
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,        // localhost any port
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,     // 127.0.0.1 any port
  /^https?:\/\/localhost(:\d+)?$/,       // http or https localhost
  /^https:\/\/[\w-]+\.github\.io$/,      // any GitHub Pages site
  /^https:\/\/(www\.)?syedishaq\.me$/,   // syedishaq.me (with or without www)
];

app.use(
  cors({
    origin(origin, callback) {
      // allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((pattern) => pattern.test(origin))) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-RUNNER-SECRET"],
  })
);

app.use(express.json({ limit: "1mb" }));

// Health check (Render can use /health)
app.get("/health", (req, res) => res.json({ ok: true, service: "talenttrack-runner" }));

// Simple auth: shared secret between TalentTrack backend and runner
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const secret = process.env.RUNNER_SECRET;
  const provided = req.header("X-RUNNER-SECRET");
  if (!secret) return res.status(500).json({ ok: false, error: "RUNNER_SECRET not set" });
  if (provided !== secret) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
});

app.post("/run", runHandler);

const port = Number(process.env.PORT || 10000);
// MUST bind 0.0.0.0 for Render
app.listen(port, "0.0.0.0", () => {
  console.log(`[TalentTrack Runner] listening on 0.0.0.0:${port}`);
});
