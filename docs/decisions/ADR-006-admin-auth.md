# ADR-006: Admin auth via Neon Auth (Better Auth) — email allowlist, magic-link, invite-only

**Date:** 2026-06-05
**Status:** Accepted
**Deciders:** user + Claude Code (claude-opus-4-8)

## Context

`/admin/review` (editor queue) and `/admin/sources` (source-health dashboard) are
currently **unauthenticated** — they expose source URLs, config, and let anyone
approve/reject alerts. We need to gate them before the product is shared.

Constraint: users should live in our existing **Neon Postgres**, not a separate
identity provider. **Neon Auth** does exactly this — a managed auth service built on
**Better Auth**, integrated into the Neon platform: it provisions a `neon_auth` schema
(users / sessions / config), deploys an auth service in the same region, and exposes
Better-Auth-compatible APIs + JWTs.

## Decision

Protect `/admin/*` with **Neon Auth (Better Auth)**, configured as:

- **Authorization = email allowlist.** A small `ADMIN_EMAILS` env list. After
  authentication, middleware + each `/admin` server component check the signed-in
  user's verified email against the list; non-members get 403. (No RBAC/teams yet —
  1–2 admins; revisit if it grows.)
- **Login = email magic-link** (passwordless). If the provisioned Neon Auth config
  doesn't expose a magic-link toggle, fall back to **email + OTP / email-verification**
  (same passwordless UX); OAuth/password disabled.
- **Registration = invite-only.** Disable public sign-up (`allow_sign_up = false`);
  admins are added explicitly (invite / manual user creation). Even if someone reaches
  a sign-in page, the allowlist is the hard gate.

### Wiring
- Provision via the Neon MCP `provision_neon_auth`; read/rotate via `get_neon_auth_config`
  / `configure_neon_auth`. Adds the `neon_auth` schema to the production branch.
- App: Better Auth client pointed at the Neon Auth `base_url`; a sign-in route; and a
  **`middleware.ts`** that gates `/admin/*` (redirect unauthenticated → sign-in;
  403 if authenticated-but-not-allowlisted). Server components re-check (defense in depth).
- Env (Vercel + local): Neon Auth base URL + keys (from provisioning) + `ADMIN_EMAILS`.
  Secrets are never committed.

## Consequences

- Users/sessions branch with the DB (Neon Auth), no extra provider, no separate user store.
- Only `/admin/*` is gated; public Wire/Radar/API stay open.
- Magic-link needs an email sender — use Neon Auth's configured email provider (SMTP)
  or the platform default; confirm at provisioning time.
- Better Auth (not Stack Auth — earlier assumption corrected).

## Alternatives considered

- **HTTP Basic Auth in middleware (shared password):** trivial, but no per-user identity,
  awkward rotation, no audit. Kept only as a possible *interim* stopgap.
- **NextAuth.js:** another dependency + its own user tables; Neon Auth keeps identity in
  our DB and is first-party to Neon.
- **Stack Auth:** Neon Auth is Better-Auth-based, so use that directly.
