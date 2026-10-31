import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
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
 
// ---------- Routes ----------
 
const app = express();
app.use(cookieParser());
 
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
 
// In production, serve the built React app from the same server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
 
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
