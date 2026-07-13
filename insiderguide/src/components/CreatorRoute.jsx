import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Session alone is NOT enough (anon checkout sessions hold authenticated JWTs).
// Source of truth: own row in creators with status='active' (RLS lets a user
// read only their own row when not active-public).
export default function CreatorRoute({ children }) {
  const [state, setState] = useState('checking') // checking | allowed | paused | denied
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) { setState('denied'); navigate('/studio/login') }
        return
      }
      const { data, error } = await supabase
        .from('creators').select('id,status').eq('id', session.user.id).maybeSingle()
      if (cancelled) return
      if (error || !data) { setState('denied'); navigate('/studio/login'); return }
      setState(data.status === 'active' ? 'allowed' : 'paused')
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check())
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [navigate])

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-text-dim text-sm font-body">Loading...</span>
      </div>
    )
  }
  if (state === 'paused') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl mb-2">Account paused</h1>
          <p className="text-text-dim text-sm">Contact us to reactivate your creator page.</p>
        </div>
      </div>
    )
  }
  return state === 'allowed' ? children : null
}
