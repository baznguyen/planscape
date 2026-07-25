'use client';
import { useMemo, useState } from 'react';
import { runPeerReview, type Severity } from '@/lib/review/peerReview';
import { useStore } from '@/store/useStore';

const TONE: Record<Severity, string> = {
  critical: 'bd', major: 'bd', minor: 'wn', pass: 'ok',
};
const WORD: Record<Severity, string> = {
  critical: 'Critical', major: 'Major', minor: 'Minor', pass: 'Pass',
};

/**
 * The senior-architect pass, surfaced in the UI. Everything here is measured
 * against the drawing, never against the model itself.
 */
export default function ReviewPanel() {
  const drawer = useStore(st => st.drawer);
  const setDrawer = useStore(st => st.setDrawer);
  const open = drawer === 'review';
  const [showPassed, setShowPassed] = useState(false);
  const report = useMemo(() => runPeerReview(), []);
  const shown = report.findings.filter(f => showPassed || f.severity !== 'pass');

  return (
    <>
      <button className={`reviewTab ${open ? 'on' : ''}`} onClick={() => setDrawer('review')}
        data-tip="Drawing review">
        {open ? '✕' : <><i>✓</i><b>{report.score.toFixed(1)}</b></>}
      </button>

      <section className={`review ${open ? 'open' : ''}`}>
        <div className="ph static">
          <span>Peer review · against issued drawing</span>
        </div>
        <div className="pb">
          <div className="scoreRow">
            <div className={`score ${report.score >= 9.5 ? 'ok' : report.score >= 8 ? 'wn' : 'bd'}`}>
              {report.score.toFixed(1)}<em>/ 10</em>
            </div>
            <div className="mini">{report.summary}<br />
              {report.checked} checks · {report.passed} clean</div>
          </div>

          <div className="mini src">
            Reference: Firstyle Homes <b>Grantham 36.9 Pristine MkII</b>, job 5792-25 sheet SK1,
            Lot 43B / 101 Campbell Street, Fairfield East. Certified areas taken from the
            DEVELOPMENT CALCULATIONS block; wall lines from an independent trace of the
            ground and first floor sheets.
          </div>

          <button className="btn" onClick={() => setShowPassed(v => !v)}>
            {showPassed ? 'Hide passing checks' : `Show all ${report.checked} checks`}</button>

          {shown.map(f => (
            <div key={f.id} className={`finding ${f.severity}`}>
              <div className="fhead">
                <b className={TONE[f.severity]}>{WORD[f.severity]}</b>
                <span>{f.discipline}</span>
              </div>
              <div className="ftitle">{f.title}</div>
              <div className="mini">{f.detail}</div>
              {(f.modelValue || f.planValue) && (
                <div className="fvals">
                  <span>model <b>{f.modelValue}</b></span>
                  <span>drawing <b>{f.planValue}</b></span>
                </div>
              )}
              <div className="fref">↳ {f.reference}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
