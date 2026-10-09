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

(The cp-gateway deploy section is added by Task 4.)
