"use client";

import { useCallback, useState } from "react";
import type { AudioMeta, ConsentState } from "./types";
import { useAnalysis } from "./hooks/useAnalysis";
import UploadZone from "./components/UploadZone";
import ConsentDialog from "./components/ConsentDialog";
import AnalyzingScreen from "./components/AnalyzingScreen";
import ResultsView from "./components/ResultsView";
import FeedbackPanel from "./components/FeedbackPanel";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

type UIPhase = "idle" | "consent" | "running" | "done" | "error";

export default function HomePage() {
  const [phase, setPhase] = useState<UIPhase>("idle");
  const [pendingAudio, setPendingAudio] = useState<AudioMeta | null>(null);
  const [confirmedAudio, setConfirmedAudio] = useState<AudioMeta | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [consent, setConsent] = useState<ConsentState | null>(null);

  const { state, run, reset } = useAnalysis(BACKEND_URL);

  const handleValidAudio = useCallback((audio: AudioMeta) => {
    setPendingAudio(audio);
    setPhase("consent");
  }, []);

  const handleConsentAccept = useCallback(
    async (c: ConsentState) => {
      if (!pendingAudio) return;
      setConsent(c);
      setConfirmedAudio(pendingAudio);
      setPendingAudio(null);
      setPhase("running");
      await run(pendingAudio, referenceText, c);
    },
    [pendingAudio, referenceText, run]
  );

  const handleConsentCancel = useCallback(() => {
    setPendingAudio(null);
    setPhase("idle");
  }, []);

  const handleReset = useCallback(() => {
    reset();
    setPhase("idle");
    setPendingAudio(null);
    setConfirmedAudio(null);
    setConsent(null);
  }, [reset]);

  // Sync analysis state → UI phase
  const effectivePhase: UIPhase =
    state.status === "done"
      ? "done"
      : state.status === "error"
      ? "error"
      : phase;

  return (
    <div className="page">
      {/* Ambient gradient */}
      <div className="page-glow" aria-hidden="true" />

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <a href="/" className="logo" aria-label="Phonix home">
            <span className="logo-mark">φ</span>
            <span className="logo-name">Phonix</span>
          </a>
          <span className="header-tagline">English pronunciation coach</span>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="container">

          {/* ── IDLE: upload form ── */}
          {effectivePhase === "idle" && (
            <div className="card card--upload">
              <div className="card-eyebrow">Step 1 of 3</div>
              <h1 className="card-title">Upload your recording</h1>
              <p className="card-desc">
                Read 30 to 45 seconds of English aloud, then upload the file.
                We&apos;ll score your pronunciation phoneme-by-phoneme.
              </p>

              <UploadZone onValid={handleValidAudio} />

              <div className="ref-section">
                <label htmlFor="ref-text" className="ref-label">
                  Reference text{" "}
                  <span className="ref-optional">optional</span>
                </label>
                <textarea
                  id="ref-text"
                  className="ref-textarea"
                  placeholder="Paste the passage you were reading aloud. Without it, we compare phonemes to our own transcription."
                  rows={3}
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── RUNNING ── */}
          {effectivePhase === "running" && (
            <div className="card">
              <div className="card-eyebrow">Step 2 of 3</div>
              <h2 className="card-title">Analysing your recording</h2>
              <AnalyzingScreen
                partialFeedback={
                  state.status === "analyzing" ? state.partialFeedback : ""
                }
              />
              {state.status === "analyzing" && state.partialFeedback && (
                <FeedbackPanel text={state.partialFeedback} streaming />
              )}
            </div>
          )}

          {/* ── DONE ── */}
          {effectivePhase === "done" && state.status === "done" && confirmedAudio && (
            <div className="card">
              <ResultsView
                result={state.result}
                audio={confirmedAudio}
                onReset={handleReset}
              />
            </div>
          )}

          {/* ── ERROR ── */}
          {effectivePhase === "error" && state.status === "error" && (
            <div className="card">
              <div className="error-box">
                <div className="error-icon">⚠</div>
                <h2 className="error-title">Something went wrong</h2>
                <p className="error-msg">{state.message}</p>
                <button className="error-btn" onClick={handleReset}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Progress dots */}
          <div className="progress-dots" aria-hidden="true">
            {(["idle", "running", "done"] as const).map((p, i) => (
              <div
                key={p}
                className={`dot ${
                  effectivePhase === p
                    ? "dot--active"
                    : i <
                      ["idle", "running", "done"].indexOf(effectivePhase)
                    ? "dot--done"
                    : ""
                }`}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>
          Audio deleted after analysis &middot; DPDP 2023 compliant &middot;
          Data in ap-southeast-1
        </p>
      </footer>

      {/* Consent overlay (portal-style, rendered outside card flow) */}
      {phase === "consent" && pendingAudio && (
        <ConsentDialog onAccept={handleConsentAccept} onCancel={handleConsentCancel} />
      )}

      <style>{`
        .page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .page-glow {
          position: fixed;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(245,166,35,0.07) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .header {
          border-bottom: 1px solid var(--border);
          background: rgba(14,14,16,0.8);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .header-inner {
          max-width: 720px;
          margin: 0 auto;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }

        .logo-mark {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--accent);
          line-height: 1;
        }

        .logo-name {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--heading);
          letter-spacing: -0.02em;
        }

        .header-tagline {
          font-size: 0.78rem;
          color: var(--dim);
          margin-left: 4px;
        }

        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }

        .container {
          max-width: 720px;
          margin: 0 auto;
          width: 100%;
          padding: 40px 20px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .card--upload {}

        .card-eyebrow {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: var(--accent);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .card-title {
          font-family: var(--font-display);
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--heading);
          line-height: 1.15;
          letter-spacing: -0.02em;
        }

        .card-desc {
          font-size: 0.92rem;
          color: var(--dim);
          line-height: 1.6;
          margin-top: -8px;
        }

        .ref-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ref-label {
          font-size: 0.83rem;
          font-weight: 600;
          color: var(--body);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ref-optional {
          font-size: 0.72rem;
          font-weight: 400;
          color: var(--dim);
          background: var(--panel);
          padding: 2px 8px;
          border-radius: 20px;
          border: 1px solid var(--border);
        }

        .ref-textarea {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--body);
          font-family: var(--font-body);
          font-size: 0.88rem;
          line-height: 1.6;
          padding: 12px 14px;
          resize: vertical;
          transition: border-color 0.15s;
          width: 100%;
        }

        .ref-textarea::placeholder { color: var(--muted); }
        .ref-textarea:focus { outline: none; border-color: var(--accent); }

        .progress-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--muted);
          transition: background 0.25s, transform 0.25s;
        }

        .dot--active {
          background: var(--accent);
          transform: scale(1.3);
        }

        .dot--done {
          background: var(--good);
        }

        .error-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 32px 0;
          text-align: center;
        }

        .error-icon {
          font-size: 2.5rem;
          color: var(--bad);
        }

        .error-title {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--heading);
        }

        .error-msg {
          font-size: 0.9rem;
          color: var(--dim);
          max-width: 360px;
          line-height: 1.6;
        }

        .error-btn {
          background: var(--accent);
          color: var(--ink);
          border: none;
          border-radius: 10px;
          padding: 12px 24px;
          font-size: 0.92rem;
          font-weight: 700;
          font-family: var(--font-body);
          cursor: pointer;
          transition: background 0.15s;
        }

        .error-btn:hover { background: var(--accent-dim); }

        .footer {
          text-align: center;
          padding: 20px;
          font-size: 0.75rem;
          color: var(--muted);
          border-top: 1px solid var(--border);
          position: relative;
          z-index: 1;
        }

        @media (max-width: 520px) {
          .card { padding: 20px; }
          .card-title { font-size: 1.4rem; }
          .rv-score-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
