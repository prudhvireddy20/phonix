"use client";

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import type { ConsentState } from "../types";

interface Props {
  onAccept: (consent: ConsentState) => void;
  onCancel: () => void;
}

export default function ConsentDialog({ onAccept, onCancel }: Props) {
  const [analytics, setAnalytics] = useState(false);

  const handleSubmit = () => {
    onAccept({ essential: true, analytics });
  };

  return (
    <div className="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="consent-card">
        <button className="consent-close" onClick={onCancel} aria-label="Cancel">
          <X size={16} />
        </button>

        <div className="consent-icon">
          <ShieldCheck size={24} />
        </div>

        <h2 id="consent-title" className="consent-title">Before we process your audio</h2>
        <p className="consent-body">
          Under India&apos;s <strong>Digital Personal Data Protection Act 2023 (DPDP)</strong>,
          we need your informed consent before handling your recording.
        </p>

        <div className="consent-items">
          {/* Essential — required, locked */}
          <label className="consent-item consent-item--required">
            <div className="ci-check ci-check--checked ci-check--locked" aria-hidden="true">✓</div>
            <div className="ci-text">
              <span className="ci-label">Essential processing <span className="ci-required">Required</span></span>
              <span className="ci-desc">
                Your audio is transcribed and analysed on our servers, then <strong>deleted within 1 hour</strong>.
                Only a hashed file reference is retained in our audit log. No audio leaves our processing pipeline.
                Data is stored in <strong>ap-southeast-1 (Singapore)</strong>.
              </span>
            </div>
          </label>

          {/* Analytics — optional */}
          <label className="consent-item" htmlFor="consent-analytics">
            <div className="ci-check-wrap">
              <input
                id="consent-analytics"
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="ci-checkbox"
              />
              <div className={`ci-check ${analytics ? "ci-check--checked" : ""}`} aria-hidden="true">
                {analytics ? "✓" : ""}
              </div>
            </div>
            <div className="ci-text">
              <span className="ci-label">Anonymous analytics <span className="ci-optional">Optional</span></span>
              <span className="ci-desc">
                Aggregated, de-identified metrics (score distributions, audio lengths) to improve Phonix.
                No audio or transcript is retained for this purpose.
              </span>
            </div>
          </label>
        </div>

        <div className="consent-footer">
          <p className="consent-note">
            You may withdraw consent at any time by contacting us. Refusing optional analytics
            has no effect on your pronunciation feedback.
          </p>
          <button className="consent-btn" onClick={handleSubmit}>
            I understand — analyse my recording
          </button>
        </div>
      </div>

      <style>{`
        .consent-overlay {
          position: fixed;
          inset: 0;
          background: rgba(14,14,16,0.88);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }
        .consent-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 32px;
          max-width: 520px;
          width: 100%;
          position: relative;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        }
        .consent-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: var(--muted);
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--dim);
        }
        .consent-close:hover { color: var(--heading); background: var(--border); }
        .consent-icon {
          width: 48px;
          height: 48px;
          background: var(--accent-glow);
          border: 1px solid rgba(245,166,35,0.3);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          margin-bottom: 20px;
        }
        .consent-title {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--heading);
          margin-bottom: 10px;
        }
        .consent-body {
          font-size: 0.9rem;
          color: var(--dim);
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .consent-body strong { color: var(--body); }
        .consent-items { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
        .consent-item {
          display: flex;
          gap: 14px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          cursor: pointer;
          transition: border-color 0.15s;
          align-items: flex-start;
        }
        .consent-item--required { cursor: default; opacity: 0.95; }
        .consent-item:not(.consent-item--required):hover { border-color: var(--accent); }
        .ci-check-wrap { position: relative; width: 20px; height: 20px; flex-shrink: 0; }
        .ci-checkbox {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
          margin: 0;
        }
        .ci-check {
          width: 20px;
          height: 20px;
          border: 2px solid var(--muted);
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: var(--ink);
          transition: background 0.15s, border-color 0.15s;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .ci-check--checked { background: var(--accent); border-color: var(--accent); }
        .ci-check--locked { background: var(--good); border-color: var(--good); cursor: default; }
        .ci-text { display: flex; flex-direction: column; gap: 4px; }
        .ci-label { font-size: 0.9rem; font-weight: 600; color: var(--heading); display: flex; align-items: center; gap: 8px; }
        .ci-required { font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(61,214,140,0.15); color: var(--good); }
        .ci-optional { font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: var(--muted); color: var(--dim); }
        .ci-desc { font-size: 0.8rem; color: var(--dim); line-height: 1.55; }
        .ci-desc strong { color: var(--body); }
        .consent-footer { display: flex; flex-direction: column; gap: 14px; }
        .consent-note { font-size: 0.78rem; color: var(--dim); line-height: 1.5; }
        .consent-btn {
          background: var(--accent);
          color: var(--ink);
          border: none;
          border-radius: 10px;
          padding: 14px 20px;
          font-family: var(--font-body);
          font-size: 0.92rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          text-align: center;
        }
        .consent-btn:hover { background: var(--accent-dim); transform: translateY(-1px); }
        .consent-btn:active { transform: translateY(0); }
      `}</style>
    </div>
  );
}
