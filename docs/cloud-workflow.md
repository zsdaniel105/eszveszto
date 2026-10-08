# Codex Cloud workflow

Each cloud task already has an isolated checkout. Work in `/workspace/eszveszto`; do not create a Git worktree unless the user explicitly requests one. Confirm repository identity and preserve existing changes. Use a feature branch for implementation and a PR targeting `main`.

Install using Node.js 24 and `npm ci --cache /workspace/.npm-cache`. If the image restricts home-directory writes, set `XDG_CONFIG_HOME=/workspace/.cloud-config` and `WRANGLER_LOG_PATH=/workspace/.cloud-logs` before Wrangler/Vite/tests. These directories live outside the checkout. Dependencies and build artifacts are retained files; server processes must be started for every new task.

Run `npm run check`. For functional browser checks, run `npm run test:e2e`; if system Chromium is installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Otherwise use Playwright's official browser installation with verification enabled. The suite runs its own production build and Wrangler server, and cleans them up.

For interactive development, run `npm run dev -- --host 0.0.0.0`. Verify `/api/health`, then perform a real room create/join flow; an open port alone is insufficient. Do not claim a deployment or live multiplayer verification from local-runtime results. Starting from a saved environment requires restarting the server; publication does not preserve processes.

GitHub HTTPS Git access uses platform-provided authentication. Test scoped read/write operations before requesting new credentials. PR API access is separate from Git access; this environment initially denied `api.github.com`. Reuse existing bindings without printing secret values. If needed, add `api.github.com` to the environment's Internet access settings for PR creation; keep existing destinations/presets.
