'use client';
import type { ReactNode } from 'react';

/**
 * The one popup shape.
 *
 * Every floating surface in the app is now this: a frosted card with a round
 * close button on the left, a centred title, and the content below. On a phone
 * it is a bottom sheet running the full width with rounded top corners; on a
 * desktop it is the same card, floating at a fixed width.
 *
 * The value is not that it looks nicer — it is that a single shape means a
 * single set of rules about stacking, safe areas and dismissal. The previous
 * mess of independently positioned panels is what put a drawer over the button
 * that opened it, three times.
 *
 * The close button sits LEFT, which is deliberate on a phone: a sheet rises
 * from the bottom, your thumb is already low and to one side, and a top-right
 * ✕ on a 6-inch screen is the one control you cannot reach one-handed.
 */
export default function Sheet({
  open, title, onClose, children, className = '',
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sheet ${className} ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header className="sheetHead">
        <button className="sheetX" onClick={onClose} aria-label={`Close ${typeof title === 'string' ? title : 'panel'}`}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
            strokeWidth="2.1" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2>{title}</h2>
        {/* balances the close button so the title is optically centred */}
        <span className="sheetPad" aria-hidden />
      </header>
      <div className="sheetBody">{children}</div>
    </section>
  );
}
