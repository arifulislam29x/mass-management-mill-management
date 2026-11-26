# Group Management API (SQLite)

This update is additive: the existing Express + better-sqlite3 authentication and ledger schema are retained. `initDatabase()` creates the new group tables automatically on next server start; existing tables and historical rows are not dropped or rewritten.

## Added endpoints

All management endpoints require the existing Admin Bearer session (`Authorization: Bearer <token>`):

- `GET /api/groups` — groups owned by / assigned to the authenticated admin.
- `POST /api/groups` — create a group. Body: `groupName`, `messName`, `managerName`, optional `description`, `address`, `profileImage`, `joinMode` (`approval` or `instant`). Returns a unique `MESS-XXXXXX` code.
- `GET /api/groups/:id` — group metadata, members, recent activity, and current admin role.
- `GET /api/groups/:id/join-requests` — manager/owner request queue.
- `POST /api/groups/:id/join-requests/:requestId/review` — `{ "decision": "approve" | "reject" }`.
- `PATCH /api/groups/:id/members/:memberId` — owner may set `role` (`meal_manager` / `member`) and/or `status` (`active` / `inactive` / `removed`).
- `POST /api/groups/:id/code/reset` — owner rotates the join code; old code immediately stops working.

Public endpoints:

- `GET /api/groups/lookup/:code` — limited group preview only.
- `POST /api/groups/join-requests` — `{ "groupCode", "name", "phone"?, "email"? }`; rate limited. Approval mode creates a pending request; instant mode adds a basic group membership.

## Important scope / release gate

This is an initial backend foundation, not a complete production release of the requested group system. Existing ledger endpoints and frontend tabs still operate on the legacy single-mess dataset; they have **not** yet been converted to require a `group_id`. A group member also does not yet have an individual login/session: the current authentication model authenticates administrators only. Therefore do not deploy this build as a multi-tenant system with real private group data until ledger tables and every read/write route are group-scoped, member authentication is implemented, and integration/security tests are completed. The added membership rows without `member_id` are invitation/request placeholders, not verified user identities.

SQLite does not provide PostgreSQL-style RLS. Equivalent isolation must be enforced in every server query and transaction, using the authenticated identity and a verified membership lookup; never trust a client-supplied group ID by itself.

## Validation

The environment used to prepare this update could not complete `npm ci` (dependency installation timed out), so a TypeScript build, runtime migration test, and API integration tests could not be run here. Run `npm ci`, `npm run lint`, and `npm run build` in a Node 20+ environment before deployment. Back up the SQLite database before first startup with this update.


## Production safety clarification (2026-11-26)

Group creation and join-request endpoints are a preliminary feature only. Existing ledger tables and all existing public/admin ledger endpoints are not consistently scoped by `group_id`; therefore these tables do not provide tenant isolation. Member authentication and per-member dashboard authorization are not complete. Do not advertise or deploy this build as a secure multi-mess production system until the complete migration and route-by-route authorization work is implemented and tested.
