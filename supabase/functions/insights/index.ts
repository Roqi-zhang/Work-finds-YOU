import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Admin-only analytics aggregation: funnel, totals, trend, channels, devices, timings.
const FUNNEL: { key: string; label: string; events: string[] }[] = [
  { key: 'visit', label: '01 访问首页', events: ['page_view'] },
  { key: 'workbench', label: '02 进入工作台', events: ['workbench_enter'] },
  { key: 'jd', label: '03 岗位画像成功', events: ['jd_parse_success'] },
  { key: 'resume', label: '04 个人画像成功', events: ['resume_parse_success'] },
  { key: 'match', label: '05 匹配报告生成', events: ['match_success'] },
  { key: 'act', label: '06 加入对比/投递', events: ['add_to_pool', 'add_to_delivery'] },
];

const FAIL_EVENTS: Record<string, string[]> = {
  jd: ['jd_parse_fail'],
  resume: ['resume_parse_fail'],
  match: ['match_fail'],
  workbench: [],
  visit: [],
  act: [],
};

type Row = {
  event: string;
  visitor_id: string | null;
  session_id: string | null;
  user_id: string | null;
  referrer: string | null;
  utm_source: string | null;
  device: string | null;
  props: Record<string, unknown> | null;
  created_at: string;
};

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.floor(q * (s.length - 1)));
  return Math.round(s[i]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const auth = req.headers.get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return json({ error: '需要登录' }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: '登录已失效' }, 401);

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roles) return json({ error: '无权限查看数据看板' }, 403);

    const body = await req.json().catch(() => ({}));
    const days = Math.min(90, Math.max(1, Number(body?.days) || 7));
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const rows: Row[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 50_000; from += PAGE) {
      const { data, error } = await admin
        .from('analytics_events')
        .select('event, visitor_id, session_id, user_id, referrer, utm_source, device, props, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < PAGE) break;
    }

    const visitorsOf = (events: string[]) => {
      const set = new Set<string>();
      for (const r of rows) {
        if (events.includes(r.event) && r.visitor_id) set.add(r.visitor_id);
      }
      return set;
    };

    // Funnel: each step counts visitors who reached it (cumulative, not ordered by time).
    let prevCount: number | null = null;
    const funnel = FUNNEL.map((step) => {
      const reached = visitorsOf(step.events).size;
      const failed = visitorsOf(FAIL_EVENTS[step.key] ?? []).size;
      const entry = {
        key: step.key,
        label: step.label,
        visitors: reached,
        conversion: prevCount == null ? 100 : pct(reached, prevCount),
        dropped: prevCount == null ? 0 : Math.max(0, prevCount - reached),
        failed,
        abandoned: prevCount == null ? 0 : Math.max(0, prevCount - reached - failed),
      };
      prevCount = reached;
      return entry;
    });

    const visitors = new Set(rows.map((r) => r.visitor_id).filter(Boolean) as string[]);
    const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean) as string[]);
    const signedIn = new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]);

    // Daily trend (Asia/Shanghai day boundary).
    const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    const trendMap = new Map<string, { day: string; visitors: Set<string>; matches: number }>();
    for (const r of rows) {
      const d = dayKey(r.created_at);
      const cell = trendMap.get(d) ?? { day: d, visitors: new Set<string>(), matches: 0 };
      if (r.visitor_id) cell.visitors.add(r.visitor_id);
      if (r.event === 'match_success') cell.matches += 1;
      trendMap.set(d, cell);
    }
    const trend = [...trendMap.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((c) => ({ day: c.day, visitors: c.visitors.size, matches: c.matches }));

    const bucket = (pick: (r: Row) => string | null) => {
      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        const k = pick(r) || '(direct)';
        const set = map.get(k) ?? new Set<string>();
        if (r.visitor_id) set.add(r.visitor_id);
        map.set(k, set);
      }
      return [...map.entries()]
        .map(([name, set]) => ({ name, visitors: set.size }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 12);
    };

    const host = (u: string | null) => {
      if (!u) return null;
      try { return new URL(u).hostname; } catch { return u.slice(0, 60); }
    };

    // AI step latency + failure rate.
    const steps = [
      { key: 'jd', ok: 'jd_parse_success', fail: 'jd_parse_fail', label: '岗位解析' },
      { key: 'resume', ok: 'resume_parse_success', fail: 'resume_parse_fail', label: '简历解析' },
      { key: 'match', ok: 'match_success', fail: 'match_fail', label: '匹配分析' },
    ];
    const timings = steps.map((s) => {
      const ms = rows
        .filter((r) => r.event === s.ok && typeof r.props?.ms === 'number')
        .map((r) => Number(r.props!.ms));
      const okCount = rows.filter((r) => r.event === s.ok).length;
      const failCount = rows.filter((r) => r.event === s.fail).length;
      return {
        label: s.label,
        ok: okCount,
        fail: failCount,
        failRate: pct(failCount, okCount + failCount),
        p50: quantile(ms, 0.5),
        p90: quantile(ms, 0.9),
      };
    });

    const errorReasons = new Map<string, number>();
    for (const r of rows) {
      if (r.event.endsWith('_fail') || r.event === 'quota_blocked' || r.event === 'error_shown') {
        const key = `${r.event} · ${String(r.props?.reason ?? r.props?.message ?? '未知').slice(0, 80)}`;
        errorReasons.set(key, (errorReasons.get(key) ?? 0) + 1);
      }
    }

    const countEvent = (e: string) => rows.filter((r) => r.event === e).length;

    return json({
      days,
      generatedAt: new Date().toISOString(),
      totals: {
        visitors: visitors.size,
        sessions: sessions.size,
        pageViews: countEvent('page_view'),
        matches: countEvent('match_success'),
        signedInVisitors: signedIn.size,
        signups: countEvent('signup_success'),
        authPrompts: countEvent('auth_prompt'),
        quotaBlocked: countEvent('quota_blocked'),
        exports: countEvent('export_pdf'),
      },
      funnel,
      trend,
      channels: bucket((r) => r.utm_source || host(r.referrer)),
      devices: bucket((r) => r.device),
      timings,
      errors: [...errorReasons.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    });
  } catch (e) {
    console.error('insights failed:', e);
    return json({ error: String(e) }, 500);
  }
});
