// insiderguide/src/pages/studio/Import.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseTakeoutCsv } from '../../lib/takeoutParser'

const HOWTO = [
  'Open takeout.google.com and sign in with the Google account that has your saved places.',
  'Click "Deselect all", then scroll down and tick only "Saved" (your Maps lists).',
  'Click "Next step", choose "Export once" + ".zip", then "Create export".',
  'Google emails you a download link (usually within minutes). Download and unzip.',
  'Inside Takeout/Saved/ you\'ll find one CSV per list (e.g. "Want to go.csv", "Colombia.csv"). Upload them below.',
]

export default function StudioImport() {
  const [step, setStep] = useState(1)
  const [countries, setCountries] = useState([])
  const [countryId, setCountryId] = useState('')
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)     // { rows, failed }
  const [preview, setPreview] = useState(null)   // rows with match_* fields
  const [rejected, setRejected] = useState({})   // row index → true (fuzzy match rejected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadCountries() {
      const { data } = await supabase.from('countries').select('id,name,flag_emoji').order('name')
      if (!cancelled) setCountries(data || [])
    }
    loadCountries()
    return () => { cancelled = true }
  }, [])

  async function handlePreview() {
    setBusy(true); setError(null)
    try {
      const text = await file.text()
      const p = parseTakeoutCsv(text)
      if (p.rows.length === 0) throw new Error('No importable rows found in this CSV.')
      setParsed(p)
      const { data, error: rpcError } = await supabase.rpc('preview_import', {
        p_country_id: countryId, p_rows: p.rows,
      })
      if (rpcError) throw rpcError
      setPreview(data)
      setStep(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    setBusy(true); setError(null)
    try {
      // Strip match ids from fuzzy matches the creator rejected → they become new stubs.
      const rows = preview.map((r, i) =>
        r.match_kind === 'fuzzy' && rejected[i]
          ? { ...r, match_business_id: null, match_name: null, match_kind: null }
          : r)
      const { data, error: rpcError } = await supabase.rpc('commit_import', {
        p_country_id: countryId,
        p_filename: file.name,
        p_list_name: file.name.replace(/\.csv$/i, ''),
        p_rows: rows,
      })
      if (rpcError) throw rpcError
      setResult(data)
      setStep(4)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-6">Import from Google Maps</h1>

      {step === 1 && (
        <div>
          <p className="text-text-secondary text-sm mb-4">
            Your saved places live in Google Maps lists. Google Takeout exports them as CSV files — here's how:
          </p>
          <ol className="flex flex-col gap-3 mb-8">
            {HOWTO.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm text-text-secondary">
                <span className="text-accent font-display shrink-0">{i + 1}.</span>{t}
              </li>
            ))}
          </ol>
          <button onClick={() => setStep(2)}
                  className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer">
            I have my CSV files
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <label className="text-sm text-text-secondary">
            Which country are these spots in?
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)}
                    className="mt-2 w-full bg-bg-card border border-border rounded-sm px-4 py-3 text-sm text-text focus:border-accent/30 focus:outline-none">
              <option value="">Select a country…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.flag_emoji} {c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-text-secondary">
            Takeout CSV file (one list at a time)
            <input type="file" accept=".csv,text/csv"
                   onChange={(e) => setFile(e.target.files?.[0] || null)}
                   className="mt-2 block w-full text-sm text-text-dim file:bg-bg-elevated file:border file:border-border file:rounded-sm file:px-4 file:py-2 file:text-text-secondary file:cursor-pointer" />
          </label>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="text-xs text-text-dim uppercase tracking-wider cursor-pointer">← Back</button>
            <button onClick={handlePreview} disabled={!file || !countryId || busy}
                    className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40">
              {busy ? 'Analyzing…' : 'Preview import'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div>
          <div className="flex gap-6 mb-4 text-sm">
            <span className="text-text-secondary">
              <strong className="text-accent">{preview.filter((r) => r.match_business_id).length}</strong> matched
            </span>
            <span className="text-text-secondary">
              <strong className="text-text">{preview.filter((r) => !r.match_business_id).length}</strong> new
            </span>
            {parsed.failed.length > 0 && (
              <span className="text-red-400/80">{parsed.failed.length} skipped (bad rows)</span>
            )}
          </div>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto mb-6 pr-1">
            {preview.map((r, i) => (
              <div key={i} className="bg-bg-card border border-border rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="text-text truncate block">{r.title}</span>
                  {r.match_kind === 'fuzzy' && (
                    <span className="text-[11px] text-accent-dim">
                      Looks like &quot;{r.match_name}&quot; already on Insider Guide — same place?
                    </span>
                  )}
                </div>
                {r.match_kind === 'fuzzy' ? (
                  <button onClick={() => setRejected((x) => ({ ...x, [i]: !x[i] }))}
                          className={`text-[11px] uppercase tracking-wider border px-2.5 py-1 rounded-full cursor-pointer ${
                            rejected[i] ? 'border-border text-text-dim' : 'border-accent/30 text-accent'}`}>
                    {rejected[i] ? 'No, new place' : 'Yes, same'}
                  </button>
                ) : (
                  <span className={`text-[11px] uppercase tracking-wider ${r.match_business_id ? 'text-accent' : 'text-text-dim'}`}>
                    {r.match_business_id ? 'matched' : 'new'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="text-xs text-text-dim uppercase tracking-wider cursor-pointer">← Back</button>
            <button onClick={handleCommit} disabled={busy}
                    className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm cursor-pointer disabled:opacity-40">
              {busy ? 'Importing…' : `Import ${preview.length} spots`}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="text-center py-10">
          <h2 className="font-display text-2xl mb-3">Import complete</h2>
          <p className="text-text-secondary text-sm mb-1">
            {result.matched} matched · {result.created} new places created · {result.failed} failed
          </p>
          <p className="text-text-dim text-xs mb-8">
            New places show basic info now and upgrade automatically as we enrich them (photos, categories, map pins).
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/studio" className="bg-accent text-bg text-sm uppercase tracking-wider px-6 py-3 rounded-sm">View my spots</Link>
            <button onClick={() => { setStep(2); setFile(null); setPreview(null); setResult(null); setRejected({}) }}
                    className="text-sm text-text-dim uppercase tracking-wider cursor-pointer">Import another list</button>
          </div>
        </div>
      )}
    </div>
  )
}
