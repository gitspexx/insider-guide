import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors })

    const { action, email, handle, display_name, creator_id, status } = await req.json()
    const admin = createClient(url, service)

    if (action === 'invite') {
      if (!email || !handle) throw new Error('email and handle required')
      const { data: user, error: uerr } = await admin.auth.admin.createUser({
        email, email_confirm: true,
      })
      if (uerr && !uerr.message.includes('already been registered')) throw uerr
      let uid = user?.user?.id
      if (!uid) {
        // user existed — look them up
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        uid = list?.users.find((u) => u.email === email)?.id
      }
      if (!uid) throw new Error('could not resolve user id')
      const { error: cerr } = await admin.from('creators').insert({
        id: uid, handle: handle.toLowerCase(), display_name: display_name || handle, status: 'active',
      })
      if (cerr) throw cerr
      return new Response(JSON.stringify({ ok: true, creator_id: uid }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (action === 'set_status') {
      if (!creator_id || !['active', 'paused'].includes(status)) throw new Error('bad args')
      const { error } = await admin.from('creators').update({ status }).eq('id', creator_id)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    throw new Error('unknown action')
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
