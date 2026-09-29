/**
 * Subject/body builders for notify-call-request.
 *
 * Split out of index.ts so message.test.js can assert the send-email contract
 * under vitest without booting Deno — index.ts imports jsr: specifiers that only
 * Deno resolves, this file imports nothing.
 */

export interface CallRequest {
  id: string;
  name: string | null;
  topic: string | null;
  days: string[] | null;
  times: string[] | null;
  timezone: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  created_at: string | null;
}

// The ids and their labels. Source of truth for the ids is src/lib/
// availability.js on the client and the CHECK constraints in
// 20260929120000_call_requests.sql in the database; this is the third place they
// appear and it is a label map, not a vocabulary — an id missing from here is
// skipped rather than printed raw, because a notification is not the place to
// discover a schema drift.
const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const TIME_LABELS: Record<string, string> = {
  morning: "mornings (09:00-12:00)",
  afternoon: "afternoons (12:00-17:00)",
  evening: "evenings (17:00-21:00)",
};

/**
 * send-email rejects any subject OR body matching its unresolved-AI-placeholder
 * guard — /\[[A-Za-z][^\]\n]{0,60}\]/ — with HTTP 422, which is what silently
 * kills the "[CLAIM] ..." subject notify-partner-application builds for claims.
 * The same guard reads the body, and the name and topic below carry prospect
 * text where "[my hotel]" is ordinary prose, so brackets are converted rather
 * than trusted. Parentheses read identically and cannot form the pattern.
 */
export function debracket(value: unknown): string {
  return String(value ?? "").replace(/\[/g, "(").replace(/\]/g, ")");
}

function or(value: string | null, fallback: string): string {
  const clean = debracket(value).trim();
  return clean || fallback;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * "Mon, Fri - mornings (09:00-12:00) and evenings (17:00-21:00)".
 *
 * Reads the label maps in order rather than the stored order, so the line is the
 * same whichever way the pills were clicked. The dedupe trigger already sorts
 * the arrays; this does not depend on that having happened.
 */
export function formatWindows(request: CallRequest): string {
  const days = Object.keys(DAY_LABELS)
    .filter((id) => (request.days || []).includes(id))
    .map((id) => DAY_LABELS[id]);
  const times = Object.keys(TIME_LABELS)
    .filter((id) => (request.times || []).includes(id))
    .map((id) => TIME_LABELS[id]);
  if (!days.length && !times.length) return "no windows on the row";
  const parts: string[] = [];
  if (days.length) parts.push(days.join(", "));
  if (times.length) parts.push(joinWithAnd(times));
  return parts.join(" - ");
}

export function buildAdminEmail(request: CallRequest): { subject: string; body: string } {
  const name = or(request.name, "Unnamed");
  const zone = or(request.timezone, "no timezone on the row");
  const subject = `New call request - ${name} (${zone})`;
  const instagram = debracket(request.instagram).trim();
  const body = [
    "New call request submitted on insiderguide.co/book",
    "",
    `Name:       ${name}`,
    `Email:      ${or(request.email, "-")}`,
    `WhatsApp:   ${or(request.whatsapp, "-")}`,
    `Instagram:  ${instagram ? `@${instagram}` : "-"}`,
    `Timezone:   ${zone}`,
    `Windows:    ${formatWindows(request)}`,
    "",
    "What they want to talk about:",
    or(request.topic, "(nothing provided)"),
    "",
    "--",
    `call_request_id: ${debracket(request.id)}`,
    "Nothing is booked. Reply to them with one time inside a window above.",
  ].join("\n");
  return { subject, body };
}

export function buildAutoReply(request: CallRequest): { subject: string; body: string } {
  const name = or(request.name, "there");
  const subject = "We got your Insider Guide call request";
  const body =
    `Hi ${name},\n\n` +
    `Thanks for asking for a call. You told us these work for you:\n\n` +
    `  ${formatWindows(request)}\n` +
    `  ${or(request.timezone, "timezone not recorded")}\n\n` +
    `A person reads every one of these and comes back with one time and an ` +
    `invite, usually within a business day. Nothing is booked yet, so there is ` +
    `nothing for you to cancel — if your week changes, just reply to this email.\n\n` +
    `Talk soon,\n` +
    `The Insider Guide team`;
  return { subject, body };
}

export function buildSlackText(request: CallRequest): string {
  return (
    `:telephone_receiver: New call request - ${or(request.name, "Unnamed")}\n` +
    `Windows: ${formatWindows(request)} (${or(request.timezone, "no timezone")})\n` +
    `Email: ${or(request.email, "-")} | WhatsApp: ${or(request.whatsapp, "-")}\n` +
    `Wants to discuss: ${or(request.topic, "(nothing provided)").slice(0, 300)}`
  );
}
