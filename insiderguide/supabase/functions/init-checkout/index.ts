// init-checkout — thin proxy that fronts BCAX bcax-charge for InsiderGuide.
//
// Why this exists:
//   bcax-charge lives in BCA Supabase project (ohvehxvexhguuslcqlml).
//   InsiderGuide user JWTs are signed by IG's Supabase project — BCA can't
//   validate them. So IG validates its own user here, then makes a server-
//   to-server call to bcax-charge using BCAX_CALLER_KEY. The frontend NEVER
//   sees BCAX_CALLER_KEY — it would leak in the browser bundle.
//
// Auth: caller must present a valid InsiderGuide user JWT.
// Body: { price_lookup_key: "insiderguide_featured" | "insiderguide_partner",
//         mode?, ... } — IG tiers are one-time only; subscription mode is not
//         supported today, but `mode` is forwarded unchanged so the upstream
//         can expand later without redeploying this proxy.
// Output: forwards the bcax-charge response shape ({client_secret, ...}) verbatim.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    },
  });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BCAX_CHARGE_URL = "https://ohvehxvexhguuslcqlml.supabase.co/functions/v1/bcax-charge";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate InsiderGuide user JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authorization required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerKey = Deno.env.get("BCAX_CALLER_KEY");
  if (!callerKey) {
    return new Response(JSON.stringify({ error: "BCAX_CALLER_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Body comes from the IG Partner page checkout. We force project_tag to
  // "insiderguide" — the caller can't claim to be a different project.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // customer_external_id resolution:
  //   1. The IG Checkout flow pre-creates a `businesses` row and passes its
  //      uuid as `customer_external_id` — that's the ledger handle bcax-callback
  //      uses to flip the right row to the right tier on `one_time.succeeded`.
  //      We only accept uuid-shaped strings to avoid letting a caller stamp
  //      arbitrary text into Stripe metadata.
  //   2. Fallback: the (anonymous) auth user.id. Disposable but non-blocking.
  const isUuid = (v: unknown): v is string =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const externalId = isUuid(body.customer_external_id)
    ? (body.customer_external_id as string)
    : user.id;

  // A uuid external id must point at a real businesses row — otherwise the
  // customer pays and bcax-callback has nothing to promote (charge lands,
  // nothing happens, manual refund). Fail BEFORE creating the PaymentIntent.
  if (isUuid(body.customer_external_id)) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: bizRow } = await admin
      .from("businesses")
      .select("id, tier_paid")
      .eq("id", externalId)
      .maybeSingle();
    if (!bizRow) {
      return json({ error: "Unknown business reference — reload the page or contact us." }, 400);
    }
    if (bizRow.tier_paid === true) {
      return json({ error: "This listing is already paid — contact us if you want to upgrade." }, 400);
    }
  }

  const forwardBody = {
    ...body,
    project_tag: "insiderguide",
    mode: body.mode ?? "elements",
    customer_email: body.customer_email ?? user.email,
    customer_external_id: externalId,
  };

  const upstream = await fetch(BCAX_CHARGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BCAX-Caller-Key": callerKey,
      "X-BCAX-Customer-User-Id": user.id,
    },
    body: JSON.stringify(forwardBody),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
});
