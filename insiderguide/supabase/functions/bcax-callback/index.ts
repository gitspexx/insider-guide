// =============================================================================
// bcax-callback (insiderguide) — receiver for BCAX one-time payment events.
//
// Why this exists:
//   bcax-webhook-stripe (in BCA Supabase project ohvehxvexhguuslcqlml) owns
//   the cross-tenant Stripe ledger. When a one-time IG payment lands, it
//   dispatches a per-tenant POST to this fn carrying the IG `businesses.id`
//   as customer_external_id and the price_lookup_key. We then promote the
//   pending row to the right tier and publish it.
//
// Auth: shared secret in X-BCAX-Callback-Key header (BCAX_CALLBACK_KEY env,
//       same value across all 3 BCAX-integrated projects — DO NOT regenerate).
//       Deployed with --no-verify-jwt; gateway JWT check is OFF in
//       supabase/config.toml so the BCA-side caller (which presents
//       X-BCAX-Callback-Key, not a JWT) reaches our handler.
//
// Events handled:
//   - one_time.succeeded  → promote businesses row to (featured|partner)
//   - one_time.failed     → log only, no state change (the user can retry).
//
// Idempotency: the UPDATE is keyed by `id = customer_external_id` and
// short-circuits if `tier` is already the target. Re-delivery from BCAX is
// safe; we always return 200 so Stripe doesn't keep retrying upstream.
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bcax-callback-key, x-bcax-event, x-bcax-project-tag",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Lookup-key → IG tier slug.
const LOOKUP_TO_TIER: Record<string, "featured" | "partner" | "complete"> = {
  insiderguide_featured: "featured",
  insiderguide_partner: "partner",
  insiderguide_complete: "complete",
};

interface CallbackBody {
  event?: string;
  customer_external_id?: string | null;
  customer_email?: string | null;
  stripe_customer_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  price_lookup_key?: string | null;
  status?: string | null;
  raw?: Record<string, unknown> | null;
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: shared secret with BCA project's tenant-callback dispatcher.
  const expectedKey = Deno.env.get("BCAX_CALLBACK_KEY");
  if (!expectedKey) {
    console.error("bcax-callback: BCAX_CALLBACK_KEY not configured");
    return json({ error: "Server not configured" }, 500);
  }
  const presentedKey = req.headers.get("x-bcax-callback-key") ?? "";
  if (presentedKey !== expectedKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Tenant tag must be insiderguide — defensive check against misconfigured
  // env vars on BCA side accidentally pointing another tenant at us.
  const projectTag = (req.headers.get("x-bcax-project-tag") ?? "").toLowerCase();
  if (projectTag !== "insiderguide") {
    return json(
      { error: `Unexpected project tag: ${projectTag || "(missing)"}` },
      400,
    );
  }

  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventType = (body.event ?? "").toLowerCase();
  if (eventType !== "one_time.succeeded" && eventType !== "one_time.failed") {
    // Silently accept other events (subscription.* etc) so future BCAX changes
    // don't 4xx us — but no-op them. 200 keeps Stripe from retrying upstream.
    return json({ ok: true, ignored: eventType || "(missing)" });
  }

  if (eventType === "one_time.failed") {
    console.warn("bcax-callback: one_time.failed", {
      customer_external_id: body.customer_external_id,
      customer_email: body.customer_email,
      price_lookup_key: body.price_lookup_key,
    });
    return json({ ok: true, action: "logged" });
  }

  // === one_time.succeeded ===
  const businessId = isUuid(body.customer_external_id)
    ? body.customer_external_id
    : null;
  if (!businessId) {
    console.error("bcax-callback: missing/invalid customer_external_id", body);
    return json({ ok: true, action: "ignored_no_business_id" });
  }

  const lookupKey = (body.price_lookup_key ?? "").toLowerCase();
  const targetTier = LOOKUP_TO_TIER[lookupKey];
  if (!targetTier) {
    console.error("bcax-callback: unknown price_lookup_key", lookupKey);
    return json({ ok: true, action: "ignored_unknown_lookup_key" });
  }

  // Service-role client — we need to bypass RLS to flip `published`/`tier`
  // on a row inserted by an anonymous applicant.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Idempotency check — if the row is already promoted, no-op.
  const { data: existing, error: readErr } = await supabase
    .from("businesses")
    .select("id, name, email, tier, tier_paid, published, paid_at, notes, paid_pending_tier")
    .eq("id", businessId)
    .maybeSingle();
  if (readErr) {
    console.error("bcax-callback: read failed", readErr);
    return json({ error: "Read failed", detail: readErr.message }, 500);
  }
  const slackPing = async (text: string) => {
    try {
      const botToken = Deno.env.get("SLACK_BOT_TOKEN") || "";
      const channel = Deno.env.get("INSIDER_GUIDE_APPLICATIONS_CHANNEL") || "";
      if (!botToken || !channel) return;
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel, text }),
      });
    } catch (e) {
      console.error("bcax-callback: slack notify failed", e);
    }
  };

  if (!existing) {
    // A charge landed with no row to promote (deleted pending row, mistyped
    // invoice link). Money moved — this MUST reach a human, not just logs.
    console.error("bcax-callback: PAYMENT WITH NO MATCHING ROW", businessId, body.customer_email);
    await slackPing(
      `:rotating_light: PAYMENT RECEIVED but no businesses row matches id ${businessId} ` +
      `(${body.customer_email || "no email"}, ${lookupKey}). Reconcile manually in Stripe/BCAX.`,
    );
    return json({ ok: true, action: "ignored_no_matching_row" });
  }
  if (existing.tier === targetTier && existing.tier_paid === true) {
    return json({ ok: true, action: "already_promoted" });
  }
  // Never let a new payment DEMOTE an already-paid listing (e.g. someone pays
  // $200 featured against a live $500 partner row — hostile or mistaken).
  if (existing.tier_paid === true) {
    await slackPing(
      `:warning: Payment for *${targetTier}* against ALREADY-PAID listing “${existing.name}” ` +
      `(current tier ${existing.tier}) — no change applied. Review in Stripe.`,
    );
    return json({ ok: true, action: "ignored_already_paid" });
  }
  // Promotable rows: a checkout pending row (paid_pending_tier set), an
  // invoiced application ([invoice marker), or a LIVE published listing —
  // that last case is the claim-upsell / find-your-business path where the
  // owner pays an upgrade against their existing public row. What stays
  // blocked: unpublished junk rows with no payment context.
  const isPayable =
    body.customer_external_id === existing.id &&
    ((existing as { paid_pending_tier?: string | null }).paid_pending_tier != null ||
      /\[invoice IG-/.test(existing.notes || "") ||
      / \(pending /i.test(existing.name || "") ||
      existing.published === true);
  if (!isPayable) {
    await slackPing(
      `:warning: Payment for *${targetTier}* against non-payable row “${existing.name}” ` +
      `(${businessId}) — no change applied. Reconcile manually.`,
    );
    return json({ ok: true, action: "ignored_not_payable" });
  }

  // Placeholder rows (created at checkout with only an email — name like
  // "john (pending Partner)" and a seeded country) must NOT go live as-is:
  // paid hero/featured slots would show junk names in the wrong country.
  // Promote the tier + payment flags but keep them unpublished; the Slack
  // ping below tells the admin to fill in details and publish.
  const isPlaceholder =
    / \(pending /i.test(existing.name || "") ||
    (existing.notes || "").startsWith("[partner-signup-paid]");

  const { error: updErr } = await supabase
    .from("businesses")
    .update({
      tier: targetTier,
      tier_paid: true,
      published: isPlaceholder ? false : true,
      paid_pending_tier: null,
      paid_at: new Date().toISOString(),
    })
    .eq("id", businessId);
  if (updErr) {
    console.error("bcax-callback: update failed", updErr);
    return json({ error: "Update failed", detail: updErr.message }, 500);
  }

  // Payment Slack ping (best effort — never fail the webhook over it).
  const amount = targetTier === "partner" ? "$500" : targetTier === "featured" ? "$200" : "$50";
  await slackPing(isPlaceholder
    ? `:moneybag: PAID — *${existing.name}* (${existing.email || "no email"}) paid ${amount} for *${targetTier}*. Placeholder row: complete the listing details in /admin and publish.`
    : `:moneybag: PAID — *${existing.name}* paid ${amount} for *${targetTier}* — now live.`);

  return json({
    ok: true,
    action: "promoted",
    tier: targetTier,
    published: !isPlaceholder,
  });
});
