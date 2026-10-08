# Tavern Tales reference

Read-only inspection of [`zsdaniel105/Tavern-Table`](https://github.com/zsdaniel105/Tavern-Table) on its `main` branch found a README titled **Dicey Dummies** and a Cloudflare Worker named **tavern-tales**. This is the accessible related project used as an architectural reference. No files or configuration in that repository were changed.

Inspected:

- `workers/index.ts`: same-origin room-code routing and static assets.
- `workers/game-room.ts`: authoritative storage, WebSocket synchronization, disconnect deadlines, host transfer, timers and Durable Object alarms.
- `game/engine.ts`: host/start/readiness validation, settings revisions, server-owned phase transitions and public state projection.
- `game/protocol.ts` and `game/types.ts`: typed actions, snapshots and phase/timer structures.
- `wrangler.jsonc`: SQLite Durable Object bindings and migrations.

Észvesztő uses the same useful separation between validated room rules, authoritative room transport and client rendering. Its **settings revision guard** was adapted from the reference: changing settings clears readiness, and delayed ready/start actions against older settings are rejected. A targeted test verifies this race condition.

Source modules and art were not copied. The reference combines four-player fantasy quests, dice, a shop, currency and a public lobby registry; those do not fit this milestone. Észvesztő has its own 2–8-player private-room model, cosmetic characters and future quiz contract. Its reconnect transport authenticates a room-scoped 256-bit credential rather than trusting a plain player ID, and credentials stay out of URLs. Hibernatable WebSockets, explicit mutation serialization, bounded messages and whole-room expiration were implemented for the new product.
