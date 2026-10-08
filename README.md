# Észvesztő ✳

Hungarian multiplayer quiz party game for 2–8 friends. This first milestone implements a real private lobby and a shared session-start transition, with a mobile-first interface and eight cosmetic characters.

## What works

- Create a room, join by seven-character code or invitation URL, and copy the invitation.
- Real-time players, character changes, readiness, connection indicators and host designation.
- Server-authorized host settings: 6/12/18 questions and Könnyed/Normál/Nehéz difficulty; defaults are 12 and Normál.
- A start requires 2–8 connected players, including a ready host. Changing settings resets everyone's readiness; changing character resets your own.
- Refresh/reconnect restores the same identity; duplicate requests do not add players or start another session.
- Host transfer, disconnected-seat reservation, room expiration and bounded input/request handling.
- A synchronized **limited session screen**, honestly labeled as the end of this milestone.

**Not implemented:** questions, category voting, scoring, sabotage effects, leaderboards, accounts or matchmaking. The UI's fixed category/sabotage labels describe the approved game rules, not playable features in this version. See [the game design contract](docs/game-design.md).

## Architecture

React + TypeScript + Vite provide the UI. A Cloudflare Worker serves the built assets and API on the same origin. Each room has one SQLite-backed Durable Object: it serializes mutations, persists state, validates actions and broadcasts full public snapshots over hibernatable WebSockets. Browser storage is only a reconnect credential store, never the room database.

- `src/client`: screens, styling, transport and browser credential storage.
- `src/shared/game.ts`: character definitions, settings, protocol and future phase/question types.
- `src/server/model.ts`: validated room transitions and public-state projection.
- `src/server/room.ts`: durable persistence, WebSocket authentication, alarms and lifecycle.
- `src/server/index.ts`: HTTP routes, same-origin protection, request limits and asset headers.
- `tests`: room rules, actual Workers-runtime integration and two-browser functional checks.

No Tavern Tales systems were reused: the apparent `zsdaniel105/tavern-tales` repository was unavailable, and repository discovery through the GitHub API was also denied in the implementation environment. Its actual path/architecture was not verified. No Tavern Tales files were modified.

## Cloudflare deployment through GitHub

The intended workflow is GitHub → Codex Cloud → pull request → Cloudflare Workers Builds. No local development or custom domain is required.

1. Review and merge the foundation PR into `main`.
2. In Cloudflare, connect **Workers Builds** to `zsdaniel105/eszveszto` and choose `main` as the production branch. This application uses Workers, not a standalone Pages static deployment.
3. Use Node.js 24 (`NODE_VERSION=24` in build settings), build command `npm ci && npm run build`, and deploy command `npx wrangler deploy`. The Vite plugin emits the Worker bundle and deploy configuration; Wrangler follows `.wrangler/deploy/config.json`.
4. Keep the `ROOMS` Durable Object binding and `v1` SQLite migration in `wrangler.jsonc`. Do not remove migrations after deployment. `ASSETS` serves `dist/client`. `ROOM_LIMITER` is a Workers rate-limiting binding (60 requests per IP per 60 seconds, namespace 1001); no external service is required.
5. Workers Builds uses Cloudflare's configured deployment authorization. If deploying from a separate CI system, store a suitably scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in its secret settings; never commit them. Anonymous gameplay itself needs no secrets, database URLs or AI API keys.
6. Cloudflare supplies an initial `workers.dev` URL. Test the live room flow described below after deployment. Browser reconnect credentials are origin-scoped, so changing domains does not transfer old sessions.

SQLite Durable Objects and Workers assets are suitable for Cloudflare's Free plan, subject to current request/storage/CPU limits. Confirm current Cloudflare quotas before opening the game to a large audience. Do not change `ROOMS` to legacy non-SQLite objects; those have different plan requirements. No Cloudflare account was bound to this coding session, and no production deployment is claimed.

## Validation in Codex Cloud and GitHub

Node.js 24 is pinned in `.node-version`. The lockfile is committed. Codex/CI installs with `npm ci` and runs:

```sh
npm run check     # lint, strict TypeScript, Workers-runtime tests, production build
npm run test:e2e  # production assets + local Wrangler + independent Chromium contexts
```

The browser runner starts and stops its own server. GitHub Actions installs Playwright Chromium; a cloud image with a preinstalled Chromium can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. On sandboxed cloud machines, put npm cache and Wrangler logs/config in writable directories (see `docs/cloud-workflow.md`). `npm run dev` starts the UI and Worker together; `npm run start` serves the production build in Wrangler. These commands are for Codex/CI, not a requirement for the product owner.

### Test a deployed lobby

On two different devices or browser profiles, create a room and open its invitation URL. Check the player list updates on both screens. Change a character, toggle readiness and change host settings; verify synchronization and readiness reset. Guests must be unable to change settings or start. Refresh one player and confirm the player count stays the same. Mark both ready and start; both should show the same session screen. Close the host's browser and wait for disconnect detection plus the 90-second grace period; the earliest connected remaining player becomes host. Verify a ninth player is rejected and a nonexistent room displays a Hungarian error. The automated browser suite exercises the core flow without pretending to validate a remote deployment.

## Sessions, cleanup and limitations

The browser creates a cryptographically random 256-bit credential. It is scoped to one room, sent over same-origin HTTPS/in the first WebSocket message, and stored **only as a SHA-256 hash** by the backend. A public player ID grants no permissions. HTTP retries reuse the credential. Codes are derived from a credential hash with collision retries, independently from the room's UUID. Public broadcasts exclude hashes and credentials. Keep invitation codes private; a code authorizes a new anonymous join, not control of another player.

Only one socket per credential is active. Opening the same session in another tab replaces the old connection with an explicit explanation. Duplicate nicknames are rejected case-insensitively; duplicate characters are allowed. If browser storage is disabled, the interface warns that refresh recovery cannot be guaranteed. Clearing storage loses your identity; a new join must use a distinct nickname until the old seat is removed.

Clients ping every 20 seconds. The server closes unauthenticated sockets after 10 seconds and stale connections after 65 seconds. A disconnected player's seat is retained for another **90 seconds**; readiness is cleared upon detected disconnect. Once removed, that identity cannot resume. Explicit leave releases the seat immediately. Host transfer chooses connected survivors first, then the earliest join time, then player ID as a deterministic tie-breaker. An empty room deletes its state; rooms also expire after **2 hours without gameplay/lobby activity** or **24 hours total**. Pings do not extend room lifetime. Alarms persist across hibernation, and the next request also checks cleanup. Mobile backgrounding may exceed the grace period.

Same-origin WebSocket checks, bounded bodies/messages, per-IP HTTP throttling, per-room join limits and per-socket action limits provide basic protection. Rate limits are practical safeguards, not a complete public-service abuse defense; in-memory join counters reset on hibernation. User content renders as text, and the production Worker applies CSP and security headers. No user credentials appear in URLs or public room snapshots.

Next milestone: server-owned category voting and question/answer transitions with an approved question dataset, synchronized deadlines and targeted tests. Agree on the speed-bonus/latency policy before adding scoring.
