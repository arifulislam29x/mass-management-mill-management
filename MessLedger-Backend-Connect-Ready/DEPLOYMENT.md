# MessLedger — Production Deployment & Setup Guide

## Architecture Overview
MessLedger uses a **decoupled full-stack architecture**:
- **Frontend**: React + TypeScript + Tailwind CSS (built with Vite into `dist/`, ready for Netlify or served directly by the backend).
- **Backend API**: Node.js + Express (`server.ts`) with strict role-based authentication (`scrypt` password hashing, server-verified Bearer sessions, rate limiting, Zod validation, and parameterized SQL).
- **Database**: SQLite with WAL mode & ACID transactions (`data/mess.db` or custom `DB_PATH` on persistent storage).

> **Important Security Note**: Never host an Admin system using only static frontend files. Always run the Express backend (`server.ts`) on a Node.js host with a persistent volume so database integrity, password hashing, and Admin authorization are enforced on the server.

---

## Option A: Split Hosting (Frontend on Netlify + Backend/Database on Render / Railway / Fly.io / VPS)

### 1. Deploy Backend (`server.ts`)
1. Push this repository to GitHub/GitLab.
2. Create a Node.js Web Service on **Render**, **Railway**, or a VPS with a **Persistent Disk** mounted (e.g., `/var/data`).
3. Set Build Command: `npm ci` (or `npm install`)
4. Set Start Command: `npm start` (runs the TypeScript server with `tsx`, which is included in production dependencies)
5. Configure these **Environment Variables** on the Backend:
   - `NODE_ENV=production`
   - `PORT=3000` (or platform default)
   - `DB_PATH=/var/data/mess.db` (points SQLite to your persistent disk; do not leave the database on an ephemeral filesystem)
   - `ALLOWED_ORIGIN=https://your-site.netlify.app` (exact Netlify URL for strict CORS)
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<your-strong-admin-password>`

### 2. Deploy Frontend on Netlify
1. Connect the repository to **Netlify** (it reads `netlify.toml` automatically).
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Set Netlify **Environment Variable**:
   - `VITE_API_BASE_URL=https://your-backend-domain.onrender.com`
5. Redeploy Netlify so Vite bundles `VITE_API_BASE_URL`.

---

## Option B: Single Full-Stack Node.js Server
Run both the frontend and backend from one server:
1. `npm install`
2. `npm run build`
3. Set `NODE_ENV=production`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `DB_PATH`.
4. `npm start`

---

## Creating the Admin Account
- **Via Environment Variables (Recommended for Production)**: Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` on your backend server. The server hashes and syncs this account automatically on startup.
- **Via First-Run Setup UI**: If `ADMIN_PASSWORD` is left unset and no admin exists yet, click **Admin Login** in the top bar to open the one-time **Claim Initial Admin Account** form. Once claimed, that setup endpoint locks permanently.

---

## Netlify Troubleshooting

- **Package manager**: this repo uses **npm** (`package-lock.json`). Do not commit `bun.lock` — Netlify auto-selects Bun when it sees one and can fail with `Unknown lockfile version`.
- **`node-gyp: command not found` / `better-sqlite3`**: `better-sqlite3` is a backend-only native module. `netlify.toml` sets `NPM_FLAGS=--ignore-scripts` so Netlify never compiles it; the frontend build does not need it.
- **Node version**: pinned to 22 via `.nvmrc` and `netlify.toml`.
- **"Cannot reach the server" screen after deploy**: Netlify hosts only the static frontend. Deploy the backend (Render/Railway/VPS) and set `VITE_API_BASE_URL` in Netlify, then redeploy. Set `ALLOWED_ORIGIN` on the backend to your Netlify URL.


## Important: Multi-group readiness

The current ledger API and calculations still operate on one shared ledger. The `mess_groups` and join-request tables/routes are only a preliminary group-management layer; they do **not** yet scope every member, meal, bazar, expense, deposit, report, and audit query by `group_id`, and there is no complete member login/session flow. Do not use the current group endpoints as a production multi-tenant boundary. A real multi-group release requires a database migration plus group-scoped authorization on every read/write/export route and member authentication. This is intentionally called out rather than presenting the preliminary group tables as complete isolation.

## Runtime checks

- The production start command is `tsx server.ts`; do not use `node server.ts` on Node 22.16, which does not load `.ts` entrypoints by default.
- `tsx` is a production dependency so hosts that omit dev dependencies can still start the API.
- Set `ALLOWED_ORIGIN` to the exact frontend origin(s), comma-separated when needed.
- Set `DB_PATH` to a persistent volume path. A successful deploy without persistent storage can still lose the ledger after a host restart/redeploy.
