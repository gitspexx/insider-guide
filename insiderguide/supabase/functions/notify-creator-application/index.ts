import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildAdminEmail,
  buildAutoReply,
  buildSlackText,
  type CreatorApplication,
} from "./message.ts";

/**
 * notify-creator-application
 *
 * Fired by /creators after a creator_applications row is inserted. Mirrors
 * notify-partner-application: admin email, Slack ping, applicant auto-reply,
 * each in its own try/catch so one failure does not abort the others, email
 * delegated to the already-deployed send-email fn rather than a new provider.
 *
 * Body: { email: "<applicant email>" }
 *
 * Why an address and not an id: anon holds INSERT on seven columns and no
 * SELECT, so the page cannot read back the row it just wrote, and putting `id`
 * in the INSERT grant to let the client mint one (the /partner trick) would
 * widen the write surface. The row is therefore looked up server-side, which
 * also means the email content comes from the database and never from the
 * caller — this endpoint cannot be used to relay arbitrary text to anyone.
 *
 * Two properties keep that lookup from becoming an abuse primitive of its own:
 *   - only rows created in the last two minutes match, so a replayed call can
 *     only re-notify someone who is applying right now;
 *   - the response is a flat { ok: true } whether or not a row was found, so
 *     it answers nothing about who has applied. Per-effect detail goes to the
 *     function log, where only we can read it.
 */

const ADMIN_EMAIL = "hello@insiderguide.co";
const SENDER = "onboarding@insiderguide.co";
const FRESH_WINDOW_MS = 2 * 60 * 1000;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

async function callSendEmail(
  sbUrl: string,
  serviceKey: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${sbUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ to, subject, body, from_email: SENDER }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function postToSlack(token: string, channel: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
  return { ok: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const sbServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!sbUrl || !sbServiceKey) {
    return jsonResponse(
      { ok: false, error: "Server misconfigured: missing SUPABASE_URL or service key" },
      500,
    );
  }
  const db = createClient(sbUrl, sbServiceKey);

  let email = "";
  try {
    const body = await req.json();
    // Same normalisation the creator_applications_dedupe trigger applies, so a
    // caller that echoes what the visitor typed still matches the stored row.
    email = String(body?.email ?? "").trim().toLowerCase().slice(0, 254);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!email) return jsonResponse({ ok: false, error: "Missing email" }, 400);

  const since = new Date(Date.now() - FRESH_WINDOW_MS).toISOString();
  const { data: rows, error: fetchErr } = await db
    .from("creator_applications")
    .select(
      "id, full_name, email, social_handle, city, list_url, pitch, created_at, countries:countries(name, flag_emoji)",
    )
    .eq("email", email)
    .eq("status", "pending")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchErr) {
    console.error("[notify-creator-application] lookup failed:", fetchErr.message);
    return jsonResponse({ ok: true });
  }
  const app = rows?.[0] as unknown as CreatorApplication | undefined;
  if (!app) {
    console.warn("[notify-creator-application] no application created in the last 2 minutes");
    return jsonResponse({ ok: true });
  }

  try {
    const { subject, body } = buildAdminEmail(app);
    const result = await callSendEmail(sbUrl, sbServiceKey, ADMIN_EMAIL, subject, body);
    if (!result.ok) console.error("[notify-creator-application] admin email failed:", result.error);
  } catch (err) {
    console.error("[notify-creator-application] admin email exception:", err);
  }

  try {
    const slackToken = Deno.env.get("SLACK_BOT_TOKEN") || "";
    const channel =
      Deno.env.get("INSIDER_GUIDE_APPLICATIONS_CHANNEL") ||
      Deno.env.get("SLACK_SPEXX_CRM_CHANNEL") ||
      "";
    if (!slackToken || !channel) {
      console.warn("[notify-creator-application] Slack not configured; skipping");
    } else {
      const result = await postToSlack(slackToken, channel, buildSlackText(app));
      if (!result.ok) console.error("[notify-creator-application] Slack post failed:", result.error);
    }
  } catch (err) {
    console.error("[notify-creator-application] Slack exception:", err);
  }

  try {
    const { subject, body } = buildAutoReply(app);
    const result = await callSendEmail(sbUrl, sbServiceKey, app.email || email, subject, body);
    if (!result.ok) console.error("[notify-creator-application] autoreply failed:", result.error);
  } catch (err) {
    console.error("[notify-creator-application] autoreply exception:", err);
  }

  return jsonResponse({ ok: true });
});
