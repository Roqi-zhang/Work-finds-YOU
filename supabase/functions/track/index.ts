import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Anonymous, fire-and-forget analytics ingest. Never blocks or fails the caller.
const MAX_BATCH = 20;

function str(v: unknown, max = 300): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const raw = await req.json().catch(() => null);
    const list = Array.isArray(raw?.events) ? raw.events : raw ? [raw] : [];
    if (!list.length) return json({ error: 'no events' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Attach the signed-in user when a valid token is present; guests stay anonymous.
    let userId: string | null = null;
    const auth = req.headers.get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    const rows = list.slice(0, MAX_BATCH).flatMap((e: Record<string, unknown>) => {
      const event = str(e?.event, 80);
      if (!event) return [];
      let props: Record<string, unknown> = {};
      if (e?.props && typeof e.props === 'object' && !Array.isArray(e.props)) {
        const encoded = JSON.stringify(e.props);
        if (encoded.length <= 4000) props = e.props as Record<string, unknown>;
      }
      return [{
        event,
        session_id: str(e?.session_id, 64),
        visitor_id: str(e?.visitor_id, 64),
        user_id: userId,
        path: str(e?.path, 200),
        referrer: str(e?.referrer, 300),
        utm_source: str(e?.utm_source, 100),
        utm_medium: str(e?.utm_medium, 100),
        utm_campaign: str(e?.utm_campaign, 100),
        device: str(e?.device, 20),
        props,
        created_at: new Date().toISOString(),
      }];
    });

    if (!rows.length) return json({ ok: true, inserted: 0 });

    const { error } = await admin.from('analytics_events').insert(rows);
    if (error) {
      console.error('analytics insert failed:', error.message);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, inserted: rows.length });
  } catch (e) {
    console.error('track failed:', e);
    return json({ error: String(e) }, 500);
  }
});
