# flm-gateway deploy rule
ALWAYS deploy with --no-verify-jwt:

    supabase functions deploy flm-gateway --project-ref geigvuysptjvvqanumld --no-verify-jwt

The /fields pages call this gateway with NO auth headers (public league tool).
A plain deploy re-enables JWT verification and 401s every coach on the live
site while health checks (which send keys) stay green. This exact outage
happened 2026-09-16 17:12-00:48 UTC after the coach_edit_slot fix deploy.
