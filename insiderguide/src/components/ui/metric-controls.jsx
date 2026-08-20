import { useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// ViewToggle — curve vs bars
// ---------------------------------------------------------------------------
export function ViewToggle({ value, onChange }) {
  const base =
    'flex h-6 w-6 items-center justify-center rounded-md transition-colors';
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
      <button
        type="button"
        aria-label="Curve view"
        aria-pressed={value === 'curve'}
        onClick={() => onChange('curve')}
        className={`${base} ${value === 'curve' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Activity size={14} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label="Bar view"
        aria-pressed={value === 'bars'}
        onClick={() => onChange('bars')}
        className={`${base} ${value === 'bars' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <BarChart3 size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeriodSelect — lightweight dropdown (no external popover dep)
// ---------------------------------------------------------------------------
export function PeriodSelect({ value, options, onChange, accentText }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        style={{ color: open ? accentText : undefined }}
      >
        {value}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-muted ${
                opt.label === value ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
