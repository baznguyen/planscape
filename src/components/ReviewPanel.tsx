'use client';
import { useMemo, useState } from 'react';
import { runPeerReview, type Severity } from '@/lib/review/peerReview';

const TONE: Record<Severity, string> = {
  critical: 'bd', major: 'bd', minor: 'wn', pass: 'ok',
};
const WORD: Record<Severity, string> = {
  critical: 'Critical', major: 'Major', minor: 'Minor', pass: 'Pass',
};

/**
 * Peer review as an engine output, not a badge.
 *
 * It runs on the model the way the thermal or acoustic solvers do, and reports
 * inside the analysis panel alongside them. It used to hang off the canvas as a
 * floating score chip, which framed a compliance check as a scoreboard.
 */
export default function ReviewSection() {
  const [openList, setOpenList] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  const report = useMemo(() => runPeerReview(), []);
  const shown = report.findings.filter(f => showPassed || f.severity !== 'pass');
  const tone = report.score >= 9.5 ? 'ok' : report.score >= 8 ? 'wn' : 'bd';

  return (
    <>
      <div className="sec">Drawing review</div>
      <div className="stat">
        <span>Conformance</span>
        <b className={tone}>{report.score.toFixed(1)} / 10</b>
      </div>
      <div className="stat">
        <span>Checks clean</span>
        <b className={report.passed === report.checked ? 'ok' : 'wn'}>
          {report.passed} / {report.checked}</b>
      </div>
      <div className="mini">{report.summary}</div>

      <button className="btn" onClick={() => setOpenList(o => !o)}>
        {openList ? 'Hide findings' : 'Show findings'}</button>

      {openList && (
        <>
          <div className="mini src">
            Measured against Firstyle Homes <b>Grantham 36.9 Pristine MkII</b>, job
            5792-25 sheet SK1. Certified areas from the DEVELOPMENT CALCULATIONS
            block; wall lines from an independent trace of the ground and first
            floor sheets.
          </div>
          <button className="btn" onClick={() => setShowPassed(v => !v)}>
            {showPassed ? 'Only open items' : `All ${report.checked} checks`}</button>
          {shown.length === 0 && <div className="mini">Nothing open.</div>}
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
        </>
      )}
    </>
  );
}
