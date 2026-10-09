# cp-gateway and cp-auth-email: deploy and auth notes

## Auth settings (checked 2026-10-09)
- Sign-ups: DISABLED project-wide (since 2026-09-17, OnDeck invite-only). The spine relies on this: accounts are created only by cp-gateway invite_accept via the admin API.
- OTP length 6, expiry 600 seconds (set by the controller via Management API 2026-10-09).
- Custom SMTP: NOT configured. Auth emails go through the Send Email hook -> cp-auth-email -> Resend (noreply@coachpilot.org). Secret AUTH_EMAIL_HOOK_SECRET (edge secret) must equal the base64 part of hook_send_email_secrets in auth config.
- Hook enabled via Management API PATCH to /v1/projects/geigvuysptjvvqanumld/config/auth with hook_send_email_secrets in the full "v1,whsec_<base64>" format. That format worked on the first attempt (HTTP 200, hook_send_email_enabled true, hook_send_email_uri set to the cp-auth-email function URL). No fallback format was needed.
- Built-in email rate limit is 2 per hour (rate_limit_email_sent); raise it in the dashboard only if the hook path turns out to be governed by it.
- Live proof: signInWithOtp for daniel.grande@ymail.com triggered at 2026-10-09T06:40:27Z UTC; receipt to be confirmed by Coach.

## Deploy
supabase functions deploy cp-auth-email --project-ref geigvuysptjvvqanumld --no-verify-jwt

## cp-gateway deploy
supabase functions deploy cp-gateway --project-ref geigvuysptjvvqanumld --no-verify-jwt
Secrets: RESEND_API_KEY already exists as a project-wide edge secret (confirmed via `supabase secrets list --project-ref geigvuysptjvvqanumld` on 2026-10-09); no `secrets set` needed.
Why --no-verify-jwt: invite_lookup and invite_accept run before the person has an account. Every other action calls auth.getUser(token) and rejects 401 without a valid session.

## Runbook
- Tests: node tests/cp.smoke.mjs ; node tests/cp-core.test.mjs ; CP_SERVICE_ROLE_KEY=... node tests/cp.rls.mjs ; CP_SERVICE_ROLE_KEY=... node tests/cp.gateway.mjs
- Kill switches live in cp_settings: email_enabled, push_enabled, self_create_teams. Flip with: update cp_settings set value='true'::jsonb, updated_at=now() where key='email_enabled';
- Nothing links to /me, /signin, /join, /l, /t from public pages. Keep it that way until Coach says.
- The mirror is one-time. Re-running --apply is idempotent for teams (source_flm_team_id), people (email) and memberships (person+team+role).
- Migrations are applied by the controller through the Supabase MCP apply_migration with the migration file's exact content (the CLI's stored DB password is wrong). Keep migration files in supabase/migrations as the source of truth.
- Auth users that existed before the mirror are linked to cp_people by the controller with: update cp_people p set auth_user_id = u.id from auth.users u where p.auth_user_id is null and lower(u.email) = lower(p.email::text);
- Preview deployments are SSO-gated; verify pages with a Vercel share link (get_access_to_vercel_url) or after merge to main.
- Age bands in scripts/cp-division-ages.json are provisional until Coach confirms; fix with update cp_teams set age_min=..., age_max=... where source_flm_team_id in (...).
