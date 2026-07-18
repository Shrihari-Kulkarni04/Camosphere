require("dotenv").config();

console.log("Gemini Key:", process.env.GEMINI_API_KEY?.slice(0, 8) + "..." + process.env.GEMINI_API_KEY?.slice(-4));
const path = require("path");
const express = require("express");
const cors = require("cors");

const chatHandler = require("./api/chat");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const BLOCKED_STATIC_PREFIXES = [
  "/api/",
  "/node_modules/",
  "/routes/",
  "/scripts/",
  "/supabase/",
  "/server.js",
  "/package",
  "/.env",
];

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.post("/api/chat", async (req, res, next) => {
  try {
    try {
  await chatHandler(req, res);
} catch (err) {
  console.error("FULL ERROR:");
  console.error(err);
  console.error(err.stack);
  throw err;
}
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  const requestPath = decodeURIComponent(req.path).replace(/\\/g, "/").toLowerCase();
  const blocked = BLOCKED_STATIC_PREFIXES.some((prefix) => requestPath.startsWith(prefix));

  if (blocked) {
    return res.status(404).json({
      success: false,
      error: "Not Found",
    });
  }

  return next();
});

app.use(
  express.static(PUBLIC_DIR, {
    dotfiles: "deny",
    index: false,
  })
);

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || error.status || 500;
  if (statusCode >= 500) {
    console.error("Express server error:", error);
  } else {
    console.warn(`Express request rejected: ${error.message}`);
  }

  return res.status(statusCode).json({
    success: false,
    error: error.message || (statusCode === 400 ? "Bad Request" : "Internal Server Error"),
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
