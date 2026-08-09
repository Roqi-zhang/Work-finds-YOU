import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, getUser } from "../_shared/req.ts";

/** After sign-in, hand every job profile created during the guest trial
 *  over to the new account so nothing the visitor did is lost. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "未登录" }, 401);

    const body = await req.json().catch(() => ({}));
    const guestKey: string = typeof body.guestKey === "string" ? body.guestKey.slice(0, 64) : "";
    if (!guestKey) return json({ claimed: 0 });

    const admin = adminClient();
    const { data: rows } = await admin
      .from("job_profiles")
      .select("id, slug")
      .is("user_id", null)
      .eq("guest_key", guestKey);

    let claimed = 0;
    for (const row of rows ?? []) {
      // Skip slugs the account already owns — the guest copy is then redundant.
      const { data: dupe } = await admin
        .from("job_profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("slug", row.slug)
        .maybeSingle();
      if (dupe) continue;
      const { error } = await admin
        .from("job_profiles")
        .update({ user_id: user.id, guest_key: null })
        .eq("id", row.id);
      if (!error) claimed++;
    }

    // Guest profiles and match reports move over wholesale — they are device-scoped
    // and cannot collide with anything the account already owns.
    const { count: profiles } = await admin
      .from("user_profiles")
      .update({ user_id: user.id, guest_key: null }, { count: "exact" })
      .is("user_id", null)
      .eq("guest_key", guestKey)
      .select("id");
    const { count: reports } = await admin
      .from("match_reports")
      .update({ user_id: user.id, guest_key: null }, { count: "exact" })
      .is("user_id", null)
      .eq("guest_key", guestKey)
      .select("id");

    return json({ claimed, profiles: profiles ?? 0, reports: reports ?? 0 });
  } catch (e) {
    console.error("claim-guest failed", e);
    return json({ error: (e as Error).message || "认领失败" }, 500);
  }
});
