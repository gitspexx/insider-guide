/**
 * Subject/body builders for notify-creator-application.
 *
 * Split out of index.ts so message.test.js can assert the send-email contract
 * under vitest without booting Deno — index.ts imports jsr: specifiers that
 * only Deno resolves, this file imports nothing.
 */

export interface CreatorApplication {
  id: string;
  full_name: string | null;
  email: string | null;
  social_handle: string | null;
  city: string | null;
  list_url: string | null;
  pitch: string | null;
  created_at: string | null;
  countries: { name: string | null; flag_emoji: string | null } | null;
}

/**
 * send-email rejects any subject OR body matching its unresolved-AI-placeholder
 * guard — /\[[A-Za-z][^\]\n]{0,60}\]/ — with HTTP 422, which is what silently
 * kills the "[CLAIM] ..." subject notify-partner-application builds for claims.
 * The same guard reads the body, and every field below carries applicant text
 * where "[my list]" is ordinary prose, so brackets are converted rather than
 * trusted. Parentheses read identically and cannot form the pattern.
 */
export function debracket(value: unknown): string {
  return String(value ?? "").replace(/\[/g, "(").replace(/\]/g, ")");
}

function country(app: CreatorApplication): string {
  const name = debracket(app.countries?.name).trim();
  const flag = debracket(app.countries?.flag_emoji).trim();
  if (!name) return "no country on the row";
  return flag ? `${flag} ${name}` : name;
}

function or(value: string | null, fallback: string): string {
  const clean = debracket(value).trim();
  return clean || fallback;
}

export function buildAdminEmail(app: CreatorApplication): { subject: string; body: string } {
  const name = or(app.full_name, "Unnamed");
  const subject = `New creator application - ${name} (${country(app)})`;
  const body = [
    "New creator application submitted on insiderguide.co/creators",
    "",
    `Name:       ${name}`,
    `Email:      ${or(app.email, "-")}`,
    `Handle:     ${or(app.social_handle, "-")}`,
    `Country:    ${country(app)}`,
    `City:       ${or(app.city, "-")}`,
    `List/link:  ${or(app.list_url, "-")}`,
    "",
    "What they cover:",
    or(app.pitch, "(none provided)"),
    "",
    "--",
    `application_id: ${debracket(app.id)}`,
    "Review at https://insider-guide.spexx.cloud/admin/creators",
  ].join("\n");
  return { subject, body };
}

export function buildAutoReply(app: CreatorApplication): { subject: string; body: string } {
  const name = or(app.full_name, "there");
  const subject = "We received your Insider Guide creator application";
  const body =
    `Hi ${name},\n\n` +
    `Thanks for applying to the Insider Guide creator network. Your application ` +
    `for ${country(app)} is in the review queue.\n\n` +
    `Every application is read by a person and we open one country at a time, ` +
    `so expect a reply within 5 business days. If you want to add anything in ` +
    `the meantime, just reply to this email.\n\n` +
    `Talk soon,\n` +
    `The Insider Guide team`;
  return { subject, body };
}

export function buildSlackText(app: CreatorApplication): string {
  return (
    `:round_pushpin: New creator application - ${or(app.full_name, "Unnamed")} ` +
    `(${country(app)})\n` +
    `Handle: ${or(app.social_handle, "-")} | Email: ${or(app.email, "-")}\n` +
    `List: ${or(app.list_url, "-")}\n` +
    `Review in /admin/creators`
  );
}
