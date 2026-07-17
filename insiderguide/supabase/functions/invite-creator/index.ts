import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Caller must be an admin — check with the CALLER's JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: isAdmin } = await asCaller.rpc('is_admin')
    if (!isAdmin) return json({ error: 'forbidden' }, 403)

    const body = await req.json()
    const { action } = body
    const admin = createClient(url, service)

    // ── existing: invite ──────────────────────────────────────────
    if (action === 'invite') {
      const { email, handle, display_name } = body
      if (!email || !handle) throw new Error('email and handle required')
      const { data: user, error: uerr } = await admin.auth.admin.createUser({ email, email_confirm: true })
      if (uerr && !uerr.message.includes('already been registered')) throw uerr
      let uid = user?.user?.id
      if (!uid) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        uid = list?.users.find((u) => u.email === email)?.id
      }
      if (!uid) throw new Error('could not resolve user id')
      const { error: cerr } = await admin.from('creators').insert({
        id: uid, handle: handle.toLowerCase(), display_name: display_name || handle, status: 'active',
      })
      if (cerr) throw cerr
      return json({ ok: true, creator_id: uid })
    }

    // ── existing: set_status ──────────────────────────────────────
    if (action === 'set_status') {
      const { creator_id, status } = body
      if (!creator_id || !['active', 'paused'].includes(status)) throw new Error('bad args')
      const { error } = await admin.from('creators').update({ status }).eq('id', creator_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: record_deal ───────────────────────────────────────────
    if (action === 'record_deal') {
      const { creator_id, business_id, tier, amount_cents, status, source, notes } = body
      if (!creator_id || !business_id) throw new Error('creator_id and business_id required')
      if (!['featured', 'partner'].includes(tier)) throw new Error('bad tier')
      const { data, error } = await admin.from('creator_deals').insert({
        creator_id,
        business_id,
        tier,
        amount_cents: Number.isFinite(amount_cents) ? amount_cents : 0,
        status: ['pending_attribution', 'confirmed', 'paid_out'].includes(status) ? status : 'confirmed',
        source: ['outreach', 'inbound', 'manual'].includes(source) ? source : 'manual',
        notes: typeof notes === 'string' ? notes : '',
      }).select('id, creator_share_cents').single()
      if (error) throw error
      return json({ ok: true, deal: data })
    }

    // ── V2: update_deal (amount/status; used to resolve/mark paid_out) ──
    if (action === 'update_deal') {
      const { deal_id, amount_cents, status, notes } = body
      if (!deal_id) throw new Error('deal_id required')
      const patch: Record<string, unknown> = {}
      if (Number.isFinite(amount_cents)) patch.amount_cents = amount_cents
      if (['pending_attribution', 'confirmed', 'paid_out'].includes(status)) patch.status = status
      if (typeof notes === 'string') patch.notes = notes
      if (Object.keys(patch).length === 0) throw new Error('nothing to update')
      const { error } = await admin.from('creator_deals').update(patch).eq('id', deal_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: resolve_attribution (confirm one, delete the losing rows) ──
    // Confirms the winning pending_attribution deal (sets amount from deal_prices
    // for its tier + status='confirmed'), deletes the other pending rows for the
    // same business.
    if (action === 'resolve_attribution') {
      const { deal_id } = body
      if (!deal_id) throw new Error('deal_id required')
      const { data: win, error: rerr } = await admin
        .from('creator_deals').select('id, business_id, tier').eq('id', deal_id).single()
      if (rerr || !win) throw new Error('deal not found')
      const { data: price } = await admin
        .from('deal_prices').select('amount_cents').eq('tier', win.tier).single()
      const { error: uerr } = await admin.from('creator_deals')
        .update({ amount_cents: price?.amount_cents ?? 0, status: 'confirmed',
                  notes: '[resolved] confirmed by admin' })
        .eq('id', deal_id)
      if (uerr) throw uerr
      const { error: derr } = await admin.from('creator_deals')
        .delete().eq('business_id', win.business_id).eq('status', 'pending_attribution').neq('id', deal_id)
      if (derr) throw derr
      return json({ ok: true })
    }

    // ── V2: set_license (none|requested|active) ───────────────────
    // Single atomic RPC: the GUC bypass and the UPDATE must run in ONE
    // transaction/session — split PostgREST calls can land on different pooled
    // backends, so the guard trigger never sees the bypass (Task 8 finding).
    if (action === 'set_license') {
      const { creator_id, newsletter_license } = body
      if (!creator_id || !['none', 'requested', 'active'].includes(newsletter_license)) throw new Error('bad args')
      const { error } = await admin.rpc('admin_set_license', {
        p_creator_id: creator_id, p_status: newsletter_license,
      })
      if (error) throw error
      return json({ ok: true })
    }

    // ── set_dm (admin flips a creator's DM-automation flag) ───────
    if (action === 'set_dm') {
      const { creator_id, enabled } = body
      if (!creator_id || typeof enabled !== 'boolean') throw new Error('bad args')
      const { error } = await admin.from('creators')
        .update({ dm_automations_enabled: enabled }).eq('id', creator_id)
      if (error) throw error
      return json({ ok: true })
    }

    // ── V2: add_request (admin creates a reel request for a creator) ──
    if (action === 'add_request') {
      const { creator_id, business_id, notes } = body
      if (!creator_id || !business_id) throw new Error('creator_id and business_id required')
      const { error } = await admin.from('creator_requests').insert({
        creator_id, business_id, type: 'reel', status: 'open',
        notes: typeof notes === 'string' ? notes : '',
      })
      if (error) throw error
      return json({ ok: true })
    }

    throw new Error('unknown action')
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400)
  }
})
