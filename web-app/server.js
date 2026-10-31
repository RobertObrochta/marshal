import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  CLIENT_URL = "http://localhost:5173",
  PORT = 3001,
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error("Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET or DISCORD_REDIRECT_URI in .env");
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

// The React app calls this on load to find out if it's logged in
app.get("/api/me", async (req, res) => {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: "not_authenticated" });

  try {
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) {
      res.clearCookie(TOKEN_COOKIE, baseCookie);
      return res.status(401).json({ error: "invalid_token" });
    }
    const user = await userRes.json();
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
