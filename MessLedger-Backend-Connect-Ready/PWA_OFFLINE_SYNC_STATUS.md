# MessLedger PWA and phone data status

## Added in this update
- Web App Manifest with app name, standalone display, theme, and 192/512 PNG + SVG icons.
- Service worker registration for production builds.
- Offline app-shell fallback for the main navigation document.
- Install App control: uses Android/Chromium's install prompt when available and shows iPhone Safari / Android manual installation instructions otherwise.
- The service worker intentionally does **not** cache `/api/*` responses or financial records. This avoids silently persisting private financial data on a shared or lost phone.

## Not implemented / release blockers
- Automatic download of the full group ledger to every member phone.
- Encrypted IndexedDB/SQLite-on-device storage, pending write queue, idempotent sync IDs, conflict resolution, and server acknowledgement.
- Member identity/login and device registration. The current server only has administrator authentication; group join requests are not yet linked to authenticated member accounts.
- Group-scoped ledger schema and API. Existing `meals`, `bazar_transactions`, `bazar_items`, `individual_expenses`, `deposits`, and `monthly_reports` tables are still legacy single-mess tables without `group_id`.
- Signed Android APK. A PWA install prompt is not an APK download. An APK requires an Android wrapper/build (e.g. Capacitor), Android SDK build tools, package signing key, and release testing. No APK is fabricated by this update.

## Required architecture before enabling automatic phone sync
1. Keep server SQLite as the authoritative database on persistent storage.
2. Add `group_id` to all ledger records and update every server query/write to validate the authenticated user's active group membership and role.
3. Add member accounts and sessions; never treat a typed name/phone or client-provided group ID as identity.
4. On approval, issue a scoped member session and device registration. Download only that group's allowed snapshot over HTTPS.
5. Store the snapshot in IndexedDB (or a Capacitor SQLite store for native Android), encrypted at rest with a device-specific key where supported.
6. Queue offline writes with client-generated UUID/idempotency keys. Only managers/admins may submit writes; server rechecks role on every sync request.
7. Resolve conflicts using server versions/ETags and explicit conflict records; never silently overwrite financial transactions.
8. Revoke device sessions on member removal, group leave, or code/session revocation. Clear local group data on logout/removal when online; mark it inaccessible offline until re-authenticated.

## Hosting note
Netlify can host the PWA frontend. The Express + better-sqlite3 backend must run on a Node host with a persistent disk; a static Netlify deployment alone cannot safely host the SQLite database.
