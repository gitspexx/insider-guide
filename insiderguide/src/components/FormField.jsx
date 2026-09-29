// FormField — the label + input chrome every public form on the site uses.
//
// Lifted out of Partner.jsx, which grew it first and where CreatorApply.jsx then
// copied it verbatim. /book is the third page that wants it, so it lives here
// instead of being pasted a third time.
//
// Those two pages still carry their private copies: both are being edited on an
// unmerged branch right now, and rewriting their import block would hand whoever
// merges that branch a conflict for no functional gain. Point them here in the
// same pass that touches them next — the three definitions are identical today.

export const inputClass =
  'w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-[14px] text-text placeholder:text-text-dim/60 focus:border-accent/30 focus:shadow-[0_0_16px_rgba(200,165,90,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 transition-all'

/**
 * Wrapping <label> — the control inside needs no id/htmlFor pairing to be
 * announced, and clicking the caption focuses it.
 *
 * `hint` renders under the control as dim helper text. Pass `hintId` and point
 * the control's aria-describedby at it when the hint carries something the
 * visitor needs read out (a format, a consequence) rather than decoration.
 */
export default function Field({ label, required, hint, hintId, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] tracking-[0.12em] uppercase text-text-secondary mb-1.5">
        {label}{required ? ' *' : ''}
      </span>
      {children}
      {hint && (
        <span id={hintId} className="block mt-1.5 text-[11px] text-text-dim font-light leading-relaxed">
          {hint}
        </span>
      )}
    </label>
  )
}
