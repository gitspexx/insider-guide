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

  const forwardBody = {
    ...body,
    project_tag: "insiderguide",
    mode: body.mode ?? "elements",
    customer_email: user.email ?? body.customer_email,
    customer_external_id: user.id,
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
