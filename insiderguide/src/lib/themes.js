// insiderguide/src/lib/themes.js
// Preset-only theming. Values override the Tailwind 4 @theme CSS variables
// (--color-accent etc.) on the CreatorPage subtree root — utilities like
// text-accent resolve to var(--color-accent) at runtime, so a subtree
// override restyles everything inside without any component changes.

export const PALETTES = {
  gold:     { label: 'Gold',     accent: '#C8A55A', dim: 'rgba(200,165,90,0.45)',  faint: 'rgba(200,165,90,0.08)',  border: 'rgba(200,165,90,0.25)' },
  emerald:  { label: 'Emerald',  accent: '#5AB88A', dim: 'rgba(90,184,138,0.45)',  faint: 'rgba(90,184,138,0.08)',  border: 'rgba(90,184,138,0.25)' },
  azure:    { label: 'Azure',    accent: '#6FA8DC', dim: 'rgba(111,168,220,0.45)', faint: 'rgba(111,168,220,0.08)', border: 'rgba(111,168,220,0.25)' },
  coral:    { label: 'Coral',    accent: '#E08A6D', dim: 'rgba(224,138,109,0.45)', faint: 'rgba(224,138,109,0.08)', border: 'rgba(224,138,109,0.25)' },
  lavender: { label: 'Lavender', accent: '#A98FCB', dim: 'rgba(169,143,203,0.45)', faint: 'rgba(169,143,203,0.08)', border: 'rgba(169,143,203,0.25)' },
  sand:     { label: 'Sand',     accent: '#C9B79A', dim: 'rgba(201,183,154,0.45)', faint: 'rgba(201,183,154,0.08)', border: 'rgba(201,183,154,0.25)' },
}

export const FONT_PAIRS = {
  editorial: { label: 'Editorial', display: "'Instrument Serif', serif",     body: "'Inter', sans-serif" },
  classic:   { label: 'Classic',   display: "'Cormorant Garamond', serif",  body: "'Inter', sans-serif" },
  soft:      { label: 'Soft',      display: "'Fraunces', serif",            body: "'Inter', sans-serif" },
  modern:    { label: 'Modern',    display: "'Space Grotesk', sans-serif",  body: "'Inter', sans-serif" },
}

export function themeToCssVars(theme) {
  const p = PALETTES[theme?.palette] || PALETTES.gold
  const f = FONT_PAIRS[theme?.fonts] || FONT_PAIRS.editorial
  return {
    '--color-accent': p.accent,
    '--color-accent-dim': p.dim,
    '--color-accent-faint': p.faint,
    '--color-accent-glow': p.faint,
    '--color-border-accent': p.border,
    '--font-display': f.display,
    '--font-body': f.body,
  }
}
