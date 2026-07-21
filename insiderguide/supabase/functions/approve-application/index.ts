import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

/**
 * approve-application — admin approves a /partner application.
 *
 * Body: { business_id, action: 'approve' | 'reject', tier?: 'listed'|'featured'|'partner' }
 *   - approve + paid tier  → invoice email (bank details + Stripe checkout link)
 *   - approve + listed     → publish the row + welcome email (no invoice)
 *   - reject               → marker only (admin replies by hand from the CRM)
 * Slack post to the Insider Guide applications channel on every approval.
 *
 * Auth: caller JWT must pass is_admin() — same gate as invite-creator.
 * Email: sent directly via the CRM email_accounts SMTP creds (lead@insiderguide.co,
 * which authenticates as the hello@ mailbox) so the invoice supports full HTML —
 * the shared send-email fn only takes plain text.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SITE = 'https://insiderguide.co'
// Sends as the onboarding@ alias (BCA pattern) — the email_accounts row auths
// as the hello@ mailbox, so replies land in hello@ where the team works.
const SENDER_EMAIL = 'onboarding@insiderguide.co'

const TIER_OFFER: Record<string, { label: string; amountUsd: number; desc: string }> = {
  featured: {
    label: 'Featured',
    amountUsd: 200,
    desc: 'Pinned at the top of your category · written profile in the creator’s voice · “Traveler-approved” badge · newsletter mention · one Instagram story from the creator covering your country.',
  },
  partner: {
    label: 'Partner',
    amountUsd: 500,
    desc: 'Everything in Featured · hero placement at the top of your country guide · logo in the next newsletter header · priority access when creators look for sponsors in your country.',
  },
}

const BANK = {
  beneficiary: 'BCAX LLC',
  bank: 'Revolut Bank UAB',
  iban: 'LT273250075519529324',
  bic: 'REVOLT21',
  address: 'Konstitucijos ave. 21B, 08130 Vilnius, Lithuania',
  correspondent: 'CHASDEFX',
}

function invoiceHtml(p: {
  invoiceNo: string; businessName: string; tierLabel: string; tierDesc: string;
  amountUsd: number; checkoutUrl: string; date: string
}) {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#8a8577;font-size:12px;white-space:nowrap;">${k}</td><td style="padding:4px 0;color:#2b2822;font-size:13px;">${v}</td></tr>`
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ec;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="background:#0B0A08;border-radius:14px 14px 0 0;padding:28px 32px;">
    <div style="color:#C8A55A;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;">Insider Guide</div>
    <div style="color:#ffffff;font-size:22px;font-family:Georgia,serif;margin-top:6px;">Invoice ${p.invoiceNo}</div>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 14px 14px;">
    <p style="color:#2b2822;font-size:14px;line-height:1.6;margin:0 0 18px;">
      Great news — <strong>${p.businessName}</strong> has been approved for the
      <strong>${p.tierLabel}</strong> placement on Insider Guide.
    </p>
    <table style="border-collapse:collapse;margin:0 0 18px;">
      ${row('Invoice', p.invoiceNo)}
      ${row('Date', p.date)}
      ${row('Placement', `${p.tierLabel} — ${p.tierDesc}`)}
      ${row('Amount', `<strong style="font-size:16px;">USD $${p.amountUsd}</strong>`)}
    </table>
    <a href="${p.checkoutUrl}"
       style="display:block;background:#C8A55A;color:#0B0A08;text-decoration:none;text-align:center;padding:14px 20px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 22px;">
      Pay by card — instant activation
    </a>
    <div style="border-top:1px solid #e8e4d8;padding-top:18px;">
      <div style="color:#8a8577;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px;">Or pay by bank transfer</div>
      <table style="border-collapse:collapse;">
        ${row('Beneficiary', BANK.beneficiary)}
        ${row('Bank', BANK.bank)}
        ${row('IBAN', BANK.iban)}
        ${row('BIC', `${BANK.bic} (correspondent: ${BANK.correspondent})`)}
        ${row('Bank address', BANK.address)}
        ${row('Reference', `<strong>${p.invoiceNo}</strong> — please include it so we can match your payment`)}
      </table>
      <p style="color:#8a8577;font-size:11px;line-height:1.6;margin:12px 0 0;">
        USD invoice — EUR transfers at the day’s rate are accepted. Your placement goes
        live within 1 business day of payment. Questions? Just reply to this email.
      </p>
    </div>
  </div>
  <p style="color:#a39d8c;font-size:11px;text-align:center;margin:18px 0 0;">
    Insider Guide · <a href="${SITE}" style="color:#a39d8c;">insiderguide.co</a> · a BCAX LLC brand
  </p>
</div></body></html>`
}

function welcomeHtml(p: { businessName: string; countrySlug: string | null }) {
  const guideUrl = p.countrySlug ? `${SITE}/${p.countrySlug}` : SITE
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ec;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="background:#ffffff;padding:28px 32px;border-radius:14px;">
    <div style="color:#C8A55A;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:10px;">Insider Guide</div>
    <p style="color:#2b2822;font-size:14px;line-height:1.7;margin:0;">
      <strong>${p.businessName}</strong> is approved and now live in the directory —
      travelers browsing the guide can find you at <a href="${guideUrl}" style="color:#C8A55A;">${guideUrl}</a>.<br/><br/>
      Want to stand out? Featured and Partner placements pin you at the top with a
      creator endorsement: <a href="${SITE}/partner" style="color:#C8A55A;">insiderguide.co/partner</a>.<br/><br/>
      — The Insider Guide team
    </p>
  </div>
</div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: isAdmin } = await asCaller.rpc('is_admin')
    if (!isAdmin) return json({ error: 'forbidden' }, 403)

    const { business_id, action, tier } = await req.json()
    if (!business_id || !['approve', 'reject'].includes(action)) throw new Error('bad args')
    const admin = createClient(url, service)

    const { data: biz, error: bizErr } = await admin
      .from('businesses')
      .select('id, name, email, notes, tier, published, countries(name, slug)')
      .eq('id', business_id).single()
    if (bizErr || !biz) throw new Error('business not found')

    if (action === 'reject') {
      await admin.from('businesses')
        .update({ notes: `${biz.notes || ''} [application-rejected]`.trim() })
        .eq('id', business_id)
      return json({ ok: true, rejected: true })
    }

    // ── approve ──
    const effectiveTier = ['listed', 'featured', 'partner'].includes(tier) ? tier : 'listed'
    if (!biz.email) throw new Error('applicant has no email')

    // SMTP creds — same lookup the CRM send-email fn uses.
    const { data: account } = await admin.from('email_accounts')
      .select('email, from_name, smtp_host, smtp_port, smtp_user')
      .eq('email', SENDER_EMAIL).single()
    if (!account) throw new Error('sender account missing')
    let smtpPass = (await admin.rpc('get_smtp_password', { account_email: SENDER_EMAIL })).data as string
    if (!smtpPass) {
      const { data: acctRow } = await admin.from('email_accounts')
        .select('smtp_pass_encrypted').eq('email', SENDER_EMAIL).single()
      smtpPass = acctRow?.smtp_pass_encrypted || ''
    }
    if (!smtpPass) throw new Error('no SMTP password for sender')

    const transporter = nodemailer.createTransport({
      host: account.smtp_host || 'smtp.gmail.com',
      port: account.smtp_port || 465,
      secure: (account.smtp_port || 465) === 465,
      auth: { user: account.smtp_user || account.email, pass: smtpPass },
    })

    let invoiceNo: string | null = null
    let subject: string
    let html: string

    if (effectiveTier === 'listed') {
      subject = `${biz.name} is live on Insider Guide`
      html = welcomeHtml({ businessName: biz.name, countrySlug: (biz as any).countries?.slug || null })
    } else {
      const offer = TIER_OFFER[effectiveTier]
      // Idempotent numbering: an earlier attempt may have reserved a number
      // (marker written) but failed later — reuse it so the applicant never
      // sees two invoice numbers for one placement. Otherwise draw from the
      // sequence and RESERVE it on the row BEFORE emailing.
      const existingNo = (biz.notes || '').match(/\[invoice (IG-[\d-]+)\]/)?.[1]
      if (existingNo) {
        invoiceNo = existingNo
      } else {
        const { data: nextNo, error: seqErr } = await admin.rpc('next_ig_invoice_no')
        if (seqErr || !nextNo) throw new Error(`invoice numbering failed: ${seqErr?.message}`)
        invoiceNo = nextNo as string
        const { error: markErr } = await admin.from('businesses')
          .update({ notes: `${biz.notes || ''} [invoice ${invoiceNo}]`.trim() })
          .eq('id', business_id)
        if (markErr) throw new Error(`could not reserve invoice number: ${markErr.message}`)
      }
      const checkoutUrl = `${SITE}/checkout?tier=${effectiveTier}&biz=${business_id}`
      subject = `Invoice ${invoiceNo} — ${offer.label} placement for ${biz.name}`
      html = invoiceHtml({
        invoiceNo,
        businessName: biz.name,
        tierLabel: offer.label,
        tierDesc: offer.desc,
        amountUsd: offer.amountUsd,
        checkoutUrl,
        date: new Date().toISOString().slice(0, 10),
      })
    }

    // Email FIRST — if SMTP fails we throw and the row stays untouched, so
    // the admin can just retry. (Previously the row was marked approved even
    // when the applicant never got the email.)
    await transporter.sendMail({
      from: `"${account.from_name || 'Insider Guide'}" <${account.email}>`,
      to: biz.email,
      subject,
      html,
    })

    if (effectiveTier === 'listed') {
      await admin.from('businesses')
        .update({ published: true, notes: `${biz.notes || ''} [application-approved listed]`.trim() })
        .eq('id', business_id)
    } else {
      // Invoice marker was already reserved above — re-read notes so we don't
      // clobber it, then finalize with the approved marker.
      const { data: fresh } = await admin.from('businesses')
        .select('notes').eq('id', business_id).single()
      const notesNow = fresh?.notes || biz.notes || ''
      await admin.from('businesses')
        .update({
          outreach_status: 'invoiced',
          notes: /\[application-approved /.test(notesNow)
            ? notesNow
            : `${notesNow} [application-approved ${effectiveTier}]`.trim(),
        })
        .eq('id', business_id)
    }

    // Slack heads-up (best effort)
    const botToken = Deno.env.get('SLACK_BOT_TOKEN') || ''
    const channel = Deno.env.get('INSIDER_GUIDE_APPLICATIONS_CHANNEL') || ''
    if (botToken && channel) {
      const text = invoiceNo
        ? `:white_check_mark: Approved *${biz.name}* for *${effectiveTier}* — invoice ${invoiceNo} ($${TIER_OFFER[effectiveTier].amountUsd}) sent to ${biz.email}`
        : `:white_check_mark: Approved *${biz.name}* — free listing published, welcome email sent to ${biz.email}`
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel, text }),
      }).catch(() => {})
    }

    return json({ ok: true, invoice: invoiceNo, tier: effectiveTier })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400)
  }
})
