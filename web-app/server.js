import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_ADMIN_PATH,
  ADMINS_URL,
  CLIENT_URL = "http://localhost:5173",
  PORT = 3001,
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error("Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET or DISCORD_REDIRECT_URI in .env");
  process.exit(1);
}
if (!DISCORD_ADMIN_PATH && !ADMINS_URL) {
  console.error("Set DISCORD_ADMIN_PATH (or ADMINS_URL) in .env, otherwise nobody can log in");
  process.exit(1);
}

const isProd = process.env.NODE_ENV === "production";
const TOKEN_COOKIE = "discord_token";
const STATE_COOKIE = "oauth_state";

const baseCookie = {
  httpOnly: true, // JS in the browser can't read it, which blocks token theft via XSS
  sameSite: "lax",
  secure: isProd, // requires HTTPS in production
  path: "/",
};

// ---------- Admin allowlist ----------

const SNOWFLAKE = /^\d{17,20}$/;

// File format: { "admin_ids": ["123...", ...], "admin_usernames": [...] }
// Only IDs are checked. Usernames can be changed and re-claimed, so they're ignored.
function extractIds(data) {
  const ids = Array.isArray(data?.admin_ids) ? data.admin_ids : [];
  return new Set(ids.map(String).filter((id) => SNOWFLAKE.test(id)));
}

async function loadAdminIds() {
  if (DISCORD_ADMIN_PATH) {
    try {
      return extractIds(JSON.parse(await readFile(DISCORD_ADMIN_PATH, "utf8")));
    } catch (err) {
      console.error(`Could not read ${DISCORD_ADMIN_PATH}:`, err.message);
    }
  }
  if (ADMINS_URL) {
    const r = await fetch(ADMINS_URL);
    if (!r.ok) throw new Error(`Admin list fetch failed: ${r.status}`);
    return extractIds(await r.json());
  }
  throw new Error("No admin list available");
}

// Fails closed: any error means nobody gets in
async function isAdmin(userId) {
  try {
    return (await loadAdminIds()).has(userId);
  } catch (err) {
    console.error(err.message);
    return false;
  }
}

async function fetchDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return r.ok ? r.json() : null;
}

// Every data route goes through this, so the admin list protects the data too
async function requireAdmin(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: "not_authenticated" });
  try {
    const user = await fetchDiscordUser(token);
    if (!user || !(await isAdmin(user.id))) {
      return res.status(401).json({ error: "not_authorized" });
    }
    next();
  } catch {
    res.status(502).json({ error: "discord_unreachable" });
  }
}

// ---------- Data files ----------

const DATA_DIR =
  process.env.DATA_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "data");

async function sendData(res, file, filter = () => true) {
  try {
    const rows = JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
    res.json(rows.filter(filter));
  } catch (err) {
    console.error(`Could not read ${file}:`, err.message);
    res.status(500).json({ error: "data_unavailable" });
  }
}

// All writes go through one queue so two requests can't read the same file
// at once and overwrite each other (or get the same ID).
let writeQueue = Promise.resolve();

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, file); // a crash mid-write can't corrupt the JSON
}

function addChampionship({ name, rounds }) {
  const job = writeQueue.then(async () => {
    const file = path.join(DATA_DIR, "data/championships.json");

    let list = [];
    try {
      list = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      const err = new Error("duplicate");
      err.code = "DUPLICATE";
      throw err;
    }

    const id = list.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
    const championship = { id, name, rounds };
    list.push(championship);

    await writeJsonAtomic(file, list);
    return championship;
  });
  writeQueue = job.catch(() => {});
  return job;
}

function addDriverStatusPoints(
  championshipId,
  { accusedDriver, points }
) {
  const job = writeQueue.then(async () => {
    // 1. Verify championship exists
    const championships = JSON.parse(
      await readFile(path.join(DATA_DIR, "data/championships.json"), "utf8")
    );
    const championship = championships.find((c) => String(c.id) === String(championshipId));
    if (!championship) {
      const err = new Error("no championship");
      err.code = "NO_CHAMPIONSHIP";
      throw err;
    }

    // 2. Read driver-status.json (which contains the array of drivers)
    const file = path.join(DATA_DIR, "data/driver-status.json");
    let drivers = [];
    try {
      drivers = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    // 3. Find the specific driver matching the championship and name
    const driver = drivers.find(
      (d) =>
        String(d.championshipId) === String(championship.id) &&
        String(d.name).toLowerCase() === String(accusedDriver).toLowerCase()
    );

    if (!driver) {
      const err = new Error("Driver not found");
      err.code = "DRIVER_NOT_FOUND";
      throw err;
    }

    // 4. Increment the points directly on that driver's object
    driver.points = (Number(driver.points) || 0) + Number(points);

    // 5. Save the updated list atomically back to the file
    await writeJsonAtomic(file, drivers);
    return driver;
  });
  writeQueue = job.catch(() => {});
  return job;
}

function nextVerdictId(list) {
  const n = list.reduce((max, v) => {
    const m = /^v-(\d+)$/.exec(String(v.id));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `v-${String(n + 1).padStart(3, "0")}`;
}

function addVerdict(
  championshipId,
  { round, incident, reporter, accusedDriver, verdict, detail, points }
) {
  const job = writeQueue.then(async () => {
    const championships = JSON.parse(
      await readFile(path.join(DATA_DIR, "data/championships.json"), "utf8")
    );
    const championship = championships.find((c) => String(c.id) === String(championshipId));
    if (!championship) {
      const err = new Error("no championship");
      err.code = "NO_CHAMPIONSHIP";
      throw err;
    }
    if (championship.rounds && round > championship.rounds) {
      const err = new Error("round out of range");
      err.code = "INVALID_ROUND";
      throw err;
    }

    const file = path.join(DATA_DIR, "data/verdicts.json");
    let list = [];
    try {
      list = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    const record = {
      id: nextVerdictId(list),
      championshipId: championship.id,
      round,
      incident,
      reporter,
      accusedDriver,
      verdict,
      detail,
      points,
    };
    list.push(record);

    await writeJsonAtomic(file, list);
    return record;
  });
  writeQueue = job.catch(() => {});
  return job;
}

// ---------- Routes ----------

const app = express();
app.use(cookieParser());
app.use(express.json());

// Step 1: send the user to Discord
app.get("/api/auth/login", (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, { ...baseCookie, maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// Step 2: Discord sends the user back here with a code
app.get("/api/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/?error=${encodeURIComponent(error)}`);

  const expected = req.cookies[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, baseCookie);
  if (!code || !state || !expected || state !== expected) {
    return res.redirect(`${CLIENT_URL}/?error=invalid_state`);
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const token = await tokenRes.json();

    const user = await fetchDiscordUser(token.access_token);
    if (!user) throw new Error("Could not fetch Discord user");

    // No cookie is set unless the user is on the admin list
    if (!(await isAdmin(user.id))) {
      return res.redirect(`${CLIENT_URL}/?error=not_authorized`);
    }

    // Cookie lives exactly as long as the token does
    res.cookie(TOKEN_COOKIE, token.access_token, {
      ...baseCookie,
      maxAge: token.expires_in * 1000,
    });
    res.redirect(CLIENT_URL);
  } catch (err) {
    console.error(err);
    res.redirect(`${CLIENT_URL}/?error=token_exchange_failed`);
  }
});

// The React app calls this on load to find out if it's logged in.
// The admin list is rechecked every time, so removing someone revokes their session.
app.get("/api/me", async (req, res) => {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: "not_authenticated" });

  try {
    const user = await fetchDiscordUser(token);
    if (!user || !(await isAdmin(user.id))) {
      res.clearCookie(TOKEN_COOKIE, baseCookie);
      return res.status(401).json({ error: "not_authorized" });
    }
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.global_name || user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "discord_unreachable" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, baseCookie);
  res.status(204).end();
});

// --- Championships ---

app.get("/api/championships", requireAdmin, (_req, res) =>
  sendData(res, "data/championships.json"));

app.post("/api/championships", requireAdmin, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const rounds = Number(req.body?.rounds);

  if (!name || name.length > 100) {
    return res.status(400).json({ error: "invalid_name" });
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 99) {
    return res.status(400).json({ error: "invalid_rounds" });
  }

  try {
    res.status(201).json(await addChampionship({ name, rounds }));
  } catch (err) {
    if (err.code === "DUPLICATE") return res.status(409).json({ error: "duplicate_name" });
    console.error(err);
    res.status(500).json({ error: "write_failed" });
  }
});

// --- Verdicts ---

app.get("/api/championships/:id/verdicts", requireAdmin, (req, res) =>
  sendData(res, "data/verdicts.json", (v) => String(v.championshipId) === req.params.id));

app.post("/api/championships/:id/verdicts", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const blank = (v) => v === undefined || v === null || v === "";

  const round = Number(b.round);
  const incident = str(b.incident);
  const reporter = str(b.reporter);
  const accusedDriver = str(b.accusedDriver);
  const verdict = str(b.verdict);
  const detail = str(b.detail);
  const points = blank(b.points) ? 0 : Number(b.points);

  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: "invalid_round" });
  }
  if (!incident || incident.length > 200) {
    return res.status(400).json({ error: "invalid_incident" });
  }
  if (!reporter || reporter.length > 60) {
    return res.status(400).json({ error: "invalid_reporter" });
  }
  if (!accusedDriver || accusedDriver.length > 60) {
    return res.status(400).json({ error: "invalid_accused_driver" });
  }
  if (!verdict || verdict.length > 50) {
    return res.status(400).json({ error: "invalid_verdict" });
  }
  if (detail.length > 100) {
    return res.status(400).json({ error: "invalid_detail" });
  }
  if (!Number.isInteger(points) || points < -99 || points > 99) {
    return res.status(400).json({ error: "invalid_points" });
  }

  try {
    // 1. Add the verdict entry
    const newVerdict = await addVerdict(req.params.id, {
      round, incident, reporter, accusedDriver, verdict, detail, points,
    });

    // 2. Update driver points if points were awarded or deducted
    if (points !== 0) {
      await addDriverStatusPoints(req.params.id, {
        round, accusedDriver, points,
      });
    }

    // 3. Return the created verdict
    res.status(201).json(newVerdict);

  } catch (err) {
    if (err.code === "NO_CHAMPIONSHIP") {
      return res.status(404).json({ error: "championship_not_found" });
    }
    if (err.code === "INVALID_ROUND") {
      return res.status(400).json({ error: "invalid_round" });
    }
    console.error(err);
    res.status(500).json({ error: "write_failed" });
  }
});

// --- Driver status ---

app.get("/api/championships/:id/drivers", requireAdmin, (req, res) =>
  sendData(res, "data/driver-status.json", (d) => String(d.championshipId) === req.params.id));

app.post("/api/championships/:id/drivers", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  console.log(req);
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const blank = (v) => v === undefined || v === null || v === "";

  const round = Number(b.round);
  const accusedDriver = str(b.accusedDriver);
  const points = blank(b.points) ? 0 : Number(b.points);

  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: "invalid_round" });
  }
  if (!accusedDriver || accusedDriver.length > 60) {
    return res.status(400).json({ error: "invalid_accused_driver" });
  }
  if (!Number.isInteger(points) || points < -99 || points > 99) {
    return res.status(400).json({ error: "invalid_points" });
  }

  try {
    res.status(201).json(
      await addDriverStatusPoints(req.params.id, {
        round, accusedDriver, points,
      })
    );
  } catch (err) {
    if (err.code === "NO_CHAMPIONSHIP") {
      return res.status(404).json({ error: "championship_not_found" });
    }
    if (err.code === "INVALID_ROUND") {
      return res.status(400).json({ error: "invalid_round" });
    }
    console.error(err);
    res.status(500).json({ error: "write_failed" });
  }
});


// In production, serve the built React app from the same server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));