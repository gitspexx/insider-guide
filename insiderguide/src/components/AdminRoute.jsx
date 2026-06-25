import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Session alone is NOT enough: the public checkout flow mints an anonymous
// session (supabase.auth.signInAnonymously) and public email signup is open,
// so a non-admin can hold a valid `authenticated` JWT. The DB-side is_admin()
// RPC (allowlist + not-anonymous) is the source of truth — RLS denies their
// data either way, but we must not render the admin shell to them.
export default function AdminRoute({ children }) {
  const [state, setState] = useState('checking') // 'checking' | 'allowed' | 'denied'
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) { setState('denied'); navigate('/admin/login') }
        return
      }
      // Confirm the signed-in user is a real admin (not anon / not a signup).
      const { data: isAdmin, error } = await supabase.rpc('is_admin')
      if (cancelled) return
      if (error || !isAdmin) {
        setState('denied')
        navigate('/admin/login')
      } else {
        setState('allowed')
      }
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

  return state === 'allowed' ? children : null
}
