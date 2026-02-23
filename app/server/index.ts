import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { config } from "./config";
import apiRoutes from "./routes/api.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [config.frontendUrl, "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: { success: false, error: "Too many requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ─── Serve React Build (production) ──────────────────────────────────────────
const buildDir = path.resolve(__dirname, "..", "build");
app.use(express.static(buildDir));

// Any non-API route falls through to React's index.html
app.get("*", (_req, res, next) => {
  if (_req.path.startsWith("/api")) return next();

  const indexHtml = path.join(buildDir, "index.html");
  res.sendFile(indexHtml, (err) => {
    if (err) {
      if (config.nodeEnv === "development") {
        res.status(404).send("Dev Mode: build/index.html not found. Use port 3000.");
      } else {
        res.status(404).send("Not Found");
      }
    }
  });
});

// ─── 404 for unmatched /api routes ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found." });
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          Solana Voting DApp — Backend API            ║
╠══════════════════════════════════════════════════════╣
║  Server:    http://localhost:${String(config.port).padEnd(24)}║
║  Network:   ${config.solanaNetwork.padEnd(40)}║
║  Program:   ${(config.programId.slice(0, 20) + "..." + config.programId.slice(-8)).padEnd(40)}║
║  Mode:      ${config.nodeEnv.padEnd(40)}║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
