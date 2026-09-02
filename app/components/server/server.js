require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { getHetznerCosts } = require("./index"); // Hetzner cost merger (monitoring + backup)
const { getGcpCosts } = require("./gcp");
const { getOpenRouterCosts } = require("./openrouter");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const app = express();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET is missing or too short (needs 32+ chars). Refusing to start.");
  process.exit(1);
}

app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
}));



const session = require("express-session");
const cookieParser = require("cookie-parser");

app.use(cookieParser());
app.use(express.json());
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const result = await pool.query(
      "SELECT user_id, username, email, password_hash, role, first_login FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.user = {
      id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    await pool.query(
      "UPDATE users SET last_login = now(), first_login = FALSE WHERE user_id = $1",
      [user.user_id]
    );

    res.json({
      ok: true,
      username: user.username,
      role: user.role,
      firstLogin: user.first_login,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const { username, email, role } = req.session.user;
  res.json({ username, email, role });
});

// Kept as an alias for backward compatibility with existing frontend calls
app.get("/api/session", (req, res) => {
  res.json({ user: req.session.user ? req.session.user.username : null });
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  if (req.session.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}
app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, email, role } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: "Username and email required" });
  }
  const finalRole = role === "admin" ? "admin" : "user";

  try {
    const existing = await pool.query(
      "SELECT user_id FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const plainPassword = crypto.randomBytes(16).toString("base64").slice(0, 16);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, first_login, created_by)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING user_id, username, email, role, created_at`,
      [username, email, passwordHash, finalRole, req.session.user.id]
    );

    res.status(201).json({
      ok: true,
      user: result.rows[0],
      temporaryPassword: plainPassword,
    });
  } catch (err) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, username, email, role, first_login, last_login, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("List users error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/users/:id/password", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, first_login = TRUE
       WHERE user_id = $2 RETURNING user_id, username`,
      [passwordHash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 4000;
const ANTHROPIC_ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY;
const HETZNER_MONITORING_TOKEN = process.env.HETZNER_MONITORING_TOKEN;

// ---- Anthropic (Claude) cost report ----
app.get("/api/anthropic-costs", requireAuth, async (req, res) => {
  if (!ANTHROPIC_ADMIN_KEY) {
    return res.status(503).json({ error: "Anthropic provider not configured" });
  }
  try {
    const days = Number(req.query.days || 7);
    const startingAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split(".")[0] + "Z";

    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", startingAt);
    url.searchParams.append("group_by[]", "description");
    url.searchParams.set("limit", "31");

    const response = await fetch(url, {
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_ADMIN_KEY,
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- OpenAI cost report ----
app.get("/api/openai-costs", requireAuth, async (req, res) => {
  if (!OPENAI_ADMIN_KEY) {
    return res.status(503).json({ error: "OpenAI provider not configured" });
  }
  try {
    const days = Number(req.query.days || 7);
    const startTime = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(startTime));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "30");
    url.searchParams.set("group_by", "line_item");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- Hetzner cost report (monitoring live + backup fixed) ----
app.get("/api/hetzner-costs", requireAuth, async (req, res) => {
  if (!HETZNER_MONITORING_TOKEN) {
    return res.status(503).json({ error: "Hetzner monitoring provider not configured" });
  }
  if (!process.env.HETZNER_BACKUP_SERVERS_JSON) {
  return res.status(503).json({
    error: "Hetzner backup provider not configured",
  });
}
  try {
    const data = await getHetznerCosts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
// ---- GCP cost report (BigQuery billing export) ----
app.get("/api/gcp-costs", requireAuth, async (req, res) => {
  if (!process.env.GCP_SERVICE_ACCOUNT_KEY_PATH || !process.env.GCP_PROJECT_ID || !process.env.GCP_BQ_DATASET || !process.env.GCP_BQ_TABLE) {
    return res.status(503).json({ error: "GCP provider not configured" });
  }
  try {
    const data = await getGcpCosts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---- OpenRouter cost report (per-model activity, last 30 UTC days) ----
app.get("/api/openrouter-costs", requireAuth, async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "OpenRouter provider not configured" });
  }
  try {
    const data = await getOpenRouterCosts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`AI cost server listening on http://localhost:${PORT}`);
});
