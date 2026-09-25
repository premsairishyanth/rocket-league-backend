# Ignition multiplayer backend

This directory can be deployed independently. Node 22+ required.

```sh
npm ci
npm start
```

Listens on `PORT` (default 3001). `GET /health` is the health check. WebSocket endpoint is `/ws`.

On Render use a **Web Service**, build `npm ci`, start `npm start`, health check `/health`. If deploying the full repository set Root Directory to `backend`; if deploying this directory alone leave it empty.

Set `NODE_ENV=production` and `ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com` to your actual frontend origins, without trailing slashes. The production server refuses startup if the allowlist is empty. TLS is terminated by Render; browsers connect using WSS via the HTTPS service URL.

Rooms are public, two-player, and in memory. Run one instance. Restarts erase rooms. When someone leaves the remaining player waits for a new opponent; a fresh match begins on rejoin. Both players vote for rematch after full time.

Run `npm test` for simulation and actual WebSocket lifecycle tests. See the root `DEPLOYMENT.md` for frontend setup and operating limits.
