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
// Email roles (BCA pattern): lead@ sells, onboarding@ confirms applications and
// sends invoices, hello@ handles ongoing communication — claim verifications go
// out from hello@ so the reply thread stays where the team works. All aliases
// auth as the hello@ mailbox.
const ONBOARDING_SENDER = 'onboarding@insiderguide.co'
const HELLO_SENDER = 'hello@insiderguide.co'

const TIER_OFFER: Record<string, { label: string; amountUsd: number; desc: string }> = {
  complete: {
    label: 'Complete',
    amountUsd: 50,
    desc: 'Full profile: photos, description, website + Instagram links, “Verified owner” badge — the listing travelers actually stop on.',
  },
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
  amountUsd: number; checkoutUrl: string; date: string; sig: string
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
    ${p.sig}
  </div>
  <p style="color:#a39d8c;font-size:11px;text-align:center;margin:18px 0 0;">
    Insider Guide · <a href="${SITE}" style="color:#a39d8c;">insiderguide.co</a> · a BCAX LLC brand
  </p>
</div></body></html>`
}

function welcomeHtml(p: { businessName: string; countrySlug: string | null; creatorHandle: string | null; sig: string }) {
  // V3 URLs are creator-scoped: /<creator>/<country>
  const guideUrl = p.countrySlug
    ? `${SITE}/${p.creatorHandle || 'alexspexx'}/${p.countrySlug}`
    : SITE
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ec;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="background:#ffffff;padding:28px 32px;border-radius:14px;">
    <div style="color:#C8A55A;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:10px;">Insider Guide</div>
    <p style="color:#2b2822;font-size:14px;line-height:1.7;margin:0;">
      <strong>${p.businessName}</strong> is approved and now live in the directory —
      travelers browsing the guide can find you at <a href="${guideUrl}" style="color:#C8A55A;">${guideUrl}</a>.<br/><br/>
      Want to stand out? Featured and Partner placements pin you at the top with a
      creator endorsement: <a href="${SITE}/partner" style="color:#C8A55A;">insiderguide.co/partner</a>.
    </p>
    ${p.sig}
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
    const { data: { user: caller } } = await asCaller.auth.getUser()
    if (!isAdmin && !caller) return json({ error: 'forbidden' }, 403)

    const { business_id, claim_id, action, tier } = await req.json()
    if (!['approve', 'reject', 'approve_claim', 'reject_claim'].includes(action)) throw new Error('bad args')
    const admin = createClient(url, service)

    // Resolve target business (claim actions resolve through the claim row).
    let claimRow: { id: string; business_id: string; email: string; contact_name: string } | null = null
    let targetBizId = business_id
    if (action === 'approve_claim' || action === 'reject_claim') {
      if (!claim_id) throw new Error('claim_id required')
      const { data: cr } = await admin.from('claim_requests')
        .select('id, business_id, email, contact_name, status').eq('id', claim_id).single()
      if (!cr) throw new Error('claim not found')
      if (cr.status !== 'pending') throw new Error('claim already handled')
      claimRow = cr
      targetBizId = cr.business_id
    }
    if (!targetBizId) throw new Error('business_id required')

    const { data: biz, error: bizErr } = await admin
      .from('businesses')
      .select('id, name, email, notes, tier, description, published, country_id, countries(name, slug, creator_id)')
      .eq('id', targetBizId).single()
    if (bizErr || !biz) throw new Error('business not found')

    // Authorization: platform admin, OR the creator who covers this country
    // (V3 model — approvals live in the covering creator's studio).
    const coveringCreator = (biz as any).countries?.creator_id || null
    if (!isAdmin && caller?.id !== coveringCreator) {
      return json({ error: 'forbidden — not your country' }, 403)
    }

    // The applicant's pitch lives in internal notes; surface it as the public
    // description on approval so listings never publish bare.
    const pitchFromNotes = (biz.notes || '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/Tier inte(?:rest|nt): \w+\.( Prefers a quick call\.)?/, '')
      .trim()

    if (action === 'reject') {
      await admin.from('businesses')
        .update({ notes: `${biz.notes || ''} [application-rejected]`.trim() })
        .eq('id', targetBizId)
      return json({ ok: true, rejected: true })
    }

    if (action === 'reject_claim') {
      await admin.from('claim_requests').update({ status: 'rejected' }).eq('id', claim_id)
      return json({ ok: true, rejected: true })
    }

    // ── approve / approve_claim ──
    const effectiveTier = ['listed', 'complete', 'featured', 'partner'].includes(tier) ? tier : 'listed'
    const recipientEmail = action === 'approve_claim' ? claimRow!.email : biz.email
    if (!recipientEmail) throw new Error('no recipient email')

    // SMTP creds — same lookup the CRM send-email fn uses. Claims verify from
    // hello@; application approvals/invoices from onboarding@.
    const senderEmail = action === 'approve_claim' ? HELLO_SENDER : ONBOARDING_SENDER
    const { data: account } = await admin.from('email_accounts')
      .select('email, from_name, smtp_host, smtp_port, smtp_user, signature_html')
      .eq('email', senderEmail).single()
    if (!account) throw new Error('sender account missing')
    let smtpPass = (await admin.rpc('get_smtp_password', { account_email: senderEmail })).data as string
    if (!smtpPass) {
      const { data: acctRow } = await admin.from('email_accounts')
        .select('smtp_pass_encrypted').eq('email', senderEmail).single()
      smtpPass = acctRow?.smtp_pass_encrypted || ''
    }
    if (!smtpPass) throw new Error('no SMTP password for sender')
    const signatureBlock = account.signature_html
      ? `<div style="border-top:1px solid #e8e4d8;margin-top:22px;padding-top:16px;">${account.signature_html}</div>`
      : ''

    const transporter = nodemailer.createTransport({
      host: account.smtp_host || 'smtp.gmail.com',
      port: account.smtp_port || 465,
      secure: (account.smtp_port || 465) === 465,
      auth: { user: account.smtp_user || account.email, pass: smtpPass },
    })

    // ── approve_claim: mark claimed + "you're verified" email (from hello@)
    //    with the full tier ladder as the upsell ──
    if (action === 'approve_claim') {
      const checkout = (t: string) => `${SITE}/checkout?tier=${t}&biz=${targetBizId}`
      const tierRow = (t: 'complete' | 'featured' | 'partner') => {
        const o = TIER_OFFER[t]
        return `<tr>
  <td style="padding:14px 0;border-top:1px solid #e8e4d8;vertical-align:top;">
    <div style="color:#2b2822;font-size:14px;font-weight:600;">${o.label} — USD $${o.amountUsd}</div>
    <div style="color:#6b675c;font-size:12px;line-height:1.6;margin-top:4px;">${o.desc}</div>
  </td>
  <td style="padding:14px 0 14px 16px;border-top:1px solid #e8e4d8;vertical-align:middle;white-space:nowrap;">
    <a href="${checkout(t)}" style="display:inline-block;background:${t === 'complete' ? '#C8A55A' : '#ffffff'};color:${t === 'complete' ? '#0B0A08' : '#8a7443'};border:1px solid #C8A55A;text-decoration:none;text-align:center;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
      $${o.amountUsd}
    </a>
  </td>
</tr>`
      }
      await transporter.sendMail({
        from: `"${account.from_name || 'Insider Guide'}" <${account.email}>`,
        to: recipientEmail,
        subject: `${biz.name} is verified on Insider Guide`,
        html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ec;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="background:#ffffff;padding:28px 32px;border-radius:14px;">
    <div style="color:#C8A55A;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:10px;">Insider Guide</div>
    <p style="color:#2b2822;font-size:14px;line-height:1.7;margin:0 0 18px;">
      Good news — we verified your claim, and <strong>${biz.name}</strong> is now
      officially yours on Insider Guide.<br/><br/>
      Right now the listing shows only the basics, and travelers tend to scroll past
      bare listings to the complete ones. If you want it to work harder for you,
      these are the upgrade options — each is a one-time payment, live within
      1 business day:
    </p>
    <table style="border-collapse:collapse;width:100%;margin:0 0 6px;">
      ${tierRow('complete')}
      ${tierRow('featured')}
      ${tierRow('partner')}
    </table>
    <p style="color:#8a8577;font-size:11px;line-height:1.6;margin:14px 0 0;">
      No pressure — your verified listing stays live either way. Prefer a bank
      transfer or have questions? Just reply to this email.
    </p>
    ${signatureBlock}
  </div>
</div></body></html>`,
      })
      await admin.from('claim_requests').update({ status: 'approved' }).eq('id', claim_id)
      await admin.from('businesses').update({
        email: biz.email || claimRow!.email,
        notes: `${biz.notes || ''} [claimed-by ${claimRow!.email}]`.trim(),
      }).eq('id', targetBizId)
      const botToken = Deno.env.get('SLACK_BOT_TOKEN') || ''
      const channel = Deno.env.get('INSIDER_GUIDE_APPLICATIONS_CHANNEL') || ''
      if (botToken && channel) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
          body: JSON.stringify({ channel, text: `:white_check_mark: Claim verified — *${biz.name}* claimed by ${claimRow!.email}; verification email + tier upsell sent from hello@.` }),
        }).catch(() => {})
      }
      return json({ ok: true, claim: 'approved' })
    }

    let invoiceNo: string | null = null
    let subject: string
    let html: string

    if (effectiveTier === 'listed') {
      let coveringHandle: string | null = null
      if (coveringCreator) {
        const { data: cw } = await admin.from('creators')
          .select('handle').eq('id', coveringCreator).maybeSingle()
        coveringHandle = cw?.handle || null
      }
      subject = `${biz.name} is live on Insider Guide`
      html = welcomeHtml({
        businessName: biz.name,
        countrySlug: (biz as any).countries?.slug || null,
        creatorHandle: coveringHandle,
        sig: signatureBlock,
      })
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
          .eq('id', targetBizId)
        if (markErr) throw new Error(`could not reserve invoice number: ${markErr.message}`)
      }
      const checkoutUrl = `${SITE}/checkout?tier=${effectiveTier}&biz=${targetBizId}`
      subject = `Invoice ${invoiceNo} — ${offer.label} placement for ${biz.name}`
      html = invoiceHtml({
        invoiceNo,
        businessName: biz.name,
        tierLabel: offer.label,
        tierDesc: offer.desc,
        amountUsd: offer.amountUsd,
        checkoutUrl,
        date: new Date().toISOString().slice(0, 10),
        sig: signatureBlock,
      })
    }

    // Email FIRST — if SMTP fails we throw and the row stays untouched, so
    // the admin can just retry. (Previously the row was marked approved even
    // when the applicant never got the email.)
    await transporter.sendMail({
      from: `"${account.from_name || 'Insider Guide'}" <${account.email}>`,
      to: recipientEmail,
      subject,
      html,
    })

    if (effectiveTier === 'listed') {
      await admin.from('businesses')
        .update({
          published: true,
          // surface the applicant's pitch as the public description so free
          // listings never publish bare
          ...(biz.description ? {} : pitchFromNotes ? { description: pitchFromNotes } : {}),
          notes: `${biz.notes || ''} [application-approved listed]`.trim(),
        })
        .eq('id', targetBizId)
    } else {
      // Invoice marker was already reserved above — re-read notes so we don't
      // clobber it, then finalize with the approved marker.
      const { data: fresh } = await admin.from('businesses')
        .select('notes').eq('id', targetBizId).single()
      const notesNow = fresh?.notes || biz.notes || ''
      await admin.from('businesses')
        .update({
          outreach_status: 'invoiced',
          ...(biz.description ? {} : pitchFromNotes ? { description: pitchFromNotes } : {}),
          notes: /\[application-approved /.test(notesNow)
            ? notesNow
            : `${notesNow} [application-approved ${effectiveTier}]`.trim(),
        })
        .eq('id', targetBizId)
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
