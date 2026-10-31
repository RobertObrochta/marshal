# Discord login + React

React (Vite) front end, Express back end. The server runs the Discord OAuth2
code flow and stores the access token in an httpOnly cookie.

## Setup

1. Go to https://discord.com/developers/applications, create an application.
2. OAuth2 -> add this Redirect URI exactly: `http://localhost:5173/api/auth/callback`
3. Copy `.env.example` to `.env` and fill in the client ID and secret.
4. `npm install`
5. `npm run dev`, then open http://localhost:5173

## Production

`npm run build && npm start` serves the built app and the API from one server.
Set `NODE_ENV=production`, use HTTPS, and update `DISCORD_REDIRECT_URI` and
`CLIENT_URL` to your real domain (and add that redirect URI in the Discord portal).
