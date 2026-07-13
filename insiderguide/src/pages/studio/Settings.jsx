// insiderguide/src/pages/studio/Settings.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PALETTES, FONT_PAIRS, themeToCssVars } from '../../lib/themes'

export default function StudioSettings() {
  const [creator, setCreator] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('creators').select('*').eq('id', session.user.id).maybeSingle()
      if (!cancelled && data) { setCreator(data); setForm(data) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleAvatar(e) {
    const f = e.target.files?.[0]
    if (!f || !creator) return
    const path = `${creator.id}/avatar-${Date.now()}.${f.name.split('.').pop()}`
    const { error } = await supabase.storage.from('creator-assets').upload(path, f, { upsert: true })
    if (error) { setError(error.message); return }
    const { data } = supabase.storage.from('creator-assets').getPublicUrl(path)
    setForm((x) => ({ ...x, avatar_url: data.publicUrl }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await supabase.from('creators').update({
      display_name: form.display_name,
      bio: form.bio,
      avatar_url: form.avatar_url,
      ig_handle: form.ig_handle,
      theme: form.theme,
      email_capture_enabled: form.email_capture_enabled,
    }).eq('id', creator.id)
    if (error) setError(error.message)
    else setSaved(true)
    setSaving(false)
  }

  if (!form) return <p className="text-text-dim text-sm">Loading…</p>

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <h1 className="font-display text-2xl">Page Settings</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim">Profile</h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-bg-elevated border border-border overflow-hidden shrink-0">
            {form.avatar_url && <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <input type="file" accept="image/*" onChange={handleAvatar}
                 className="text-sm text-text-dim file:bg-bg-elevated file:border file:border-border file:rounded-sm file:px-4 file:py-2 file:text-text-secondary file:cursor-pointer" />
        </div>
        <input value={form.display_name} placeholder="Display name"
               onChange={(e) => setForm({ ...form, display_name: e.target.value })}
               className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none" />
        <textarea value={form.bio} placeholder="Short bio shown on your page" rows={3}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none resize-none" />
        <input value={form.ig_handle || ''} placeholder="Instagram handle (without @)"
               onChange={(e) => setForm({ ...form, ig_handle: e.target.value })}
               className="bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none" />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-4">Accent color</h2>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(PALETTES).map(([key, p]) => (
            <button key={key} onClick={() => setForm({ ...form, theme: { ...form.theme, palette: key } })}
                    title={p.label}
                    className={`w-10 h-10 rounded-full cursor-pointer border-2 transition-transform hover:scale-110 ${
                      form.theme?.palette === key ? 'border-text' : 'border-transparent'}`}
                    style={{ backgroundColor: p.accent }} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-4">Typography</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(FONT_PAIRS).map(([key, f]) => (
            <button key={key} onClick={() => setForm({ ...form, theme: { ...form.theme, fonts: key } })}
                    className={`bg-bg-card border rounded-xl p-4 text-left cursor-pointer ${
                      form.theme?.fonts === key ? 'border-accent/50' : 'border-border hover:border-border-hover'}`}>
              <span className="block text-lg text-text" style={{ fontFamily: f.display }}>{f.label}</span>
              <span className="block text-xs text-text-dim" style={{ fontFamily: f.body }}>Body text preview</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-bg-card border border-border rounded-xl p-5" style={themeToCssVars(form.theme)}>
        <h2 className="text-xs uppercase tracking-[0.2em] text-accent-dim mb-2">Live preview</h2>
        <h3 className="font-display text-2xl text-accent mb-1" style={{ fontFamily: (FONT_PAIRS[form.theme?.fonts] || FONT_PAIRS.editorial).display }}>
          {form.display_name || 'Your name'}
        </h3>
        <p className="text-sm text-text-secondary">{form.bio || 'Your bio appears here.'}</p>
      </section>

      <section className="flex items-center justify-between bg-bg-card border border-border rounded-xl p-5">
        <div>
          <h2 className="text-sm text-text mb-1">Collect visitor emails</h2>
          <p className="text-xs text-text-dim">Show a soft email popup on your page. You get the list.</p>
        </div>
        <button onClick={() => setForm({ ...form, email_capture_enabled: !form.email_capture_enabled })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative ${
                  form.email_capture_enabled ? 'bg-accent' : 'bg-bg-elevated border border-border'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-text transition-all ${
            form.email_capture_enabled ? 'left-6' : 'left-0.5'}`} />
        </button>
      </section>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
                className="bg-accent text-bg text-sm uppercase tracking-wider px-8 py-3 rounded-sm cursor-pointer disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-xs text-accent">Saved ✓</span>}
      </div>
    </div>
  )
}
