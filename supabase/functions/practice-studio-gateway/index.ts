// practice-studio-gateway — CueOps project (xyphakgtsvtaaswmvvol), NOT CoachPilot.
// Deploy: supabase functions deploy practice-studio-gateway --project-ref xyphakgtsvtaaswmvvol --no-verify-jwt
// v2: staff_plans public read (published-only) + publish_to_staff flag on save.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-studio-pin',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';

  // Public: published plans for the assistant-coach portal. Drafts and
  // unpublished plans never leave this branch; coach_notes stay private.
  if (req.method === 'GET' && action === 'staff_plans') {
    const { data, error } = await db
      .from('hq_practice_plans')
      .select('slug, title, session_info, start_times, blocks, target_minutes, published_at, updated_at')
      .eq('published_to_staff', true)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) return json({ error: error.message }, 500);
    return json({ plans: data ?? [] });
  }

  // Everything below is Coach-only.
  if (req.headers.get('x-studio-pin') !== '0908') return json({ error: 'unauthorized' }, 401);

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('hq_practice_plans')
      .select('slug, title, session_info, start_times, blocks, target_minutes, status, coach_notes, updated_at, submitted_at, published_to_staff, published_at')
      .order('updated_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ plans: data });
  }

  if (req.method === 'POST') {
    let payload: Record<string, unknown>;
    try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const slug = String(payload.slug || '');
    if (!slug) return json({ error: 'slug required' }, 400);

    // Publish toggle can arrive alone (from the publish button) or with a save.
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.title === 'string') update.title = payload.title;
    if (typeof payload.session_info === 'string') update.session_info = payload.session_info;
    if (typeof payload.coach_notes === 'string') update.coach_notes = payload.coach_notes;
    if (Array.isArray(payload.blocks)) {
      if (payload.blocks.length > 50) return json({ error: 'too many blocks' }, 400);
      update.blocks = payload.blocks;
    }
    if (payload.publish_to_staff === true) {
      update.published_to_staff = true;
      update.published_at = new Date().toISOString();
    } else if (payload.publish_to_staff === false) {
      update.published_to_staff = false;
    }
    if (payload.submit === true) {
      update.status = 'submitted';
      update.submitted_at = new Date().toISOString();
    } else if (payload.publish_to_staff === undefined || Array.isArray(payload.blocks)) {
      // A content save marks the plan edited; a bare publish toggle leaves status alone.
      if (Array.isArray(payload.blocks) || typeof payload.title === 'string') update.status = 'edited';
    }

    const { data, error } = await db
      .from('hq_practice_plans')
      .update(update)
      .eq('slug', slug)
      .select('slug, status, updated_at, published_to_staff')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ saved: data });
  }

  return json({ error: 'method not allowed' }, 405);
});
