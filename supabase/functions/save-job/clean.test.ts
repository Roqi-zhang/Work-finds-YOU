import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanJob, rateLimited, JD_MAX } from "./clean.ts";

Deno.test("rejects non-http links", () => {
  assertEquals(cleanJob({ url: "javascript:alert(1)", title: "x" }).ok, false);
});
Deno.test("caps JD at 30k chars and defaults status", () => {
  const r = cleanJob({ url: "https://a.com/j/1", title: "PM", jd_text: "a".repeat(40000) });
  if (!r.ok) throw new Error("expected ok");
  assertEquals(r.job.jd_text!.length, JD_MAX);
  assertEquals(r.job.status, "待投递");
});
Deno.test("limits 30 saves per minute per user", () => {
  for (let i = 0; i < 30; i++) assertEquals(rateLimited("u1", 1000 + i), false);
  assertEquals(rateLimited("u1", 2000), true);
  assertEquals(rateLimited("u1", 70000), false);
});
