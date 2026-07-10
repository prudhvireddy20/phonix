"use client";

import { RotateCcw, Download, CheckCircle } from "lucide-react";
import type { AnalysisResult, AudioMeta } from "../types";
import ScoreRing from "./ScoreRing";
import WordHighlight from "./WordHighlight";
import FeedbackPanel from "./FeedbackPanel";
import AudioPlayer from "./AudioPlayer";

interface Props {
  result: AnalysisResult;
  audio: AudioMeta;
  onReset: () => void;
}

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="stat-pill">
      <span className="stat-value" style={color ? { color } : undefined}>{value}</span>
      <span className="stat-label">{label}</span>
      <style>{`
        .stat-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 14px 20px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          min-width: 80px;
        }
        .stat-value {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--heading);
          line-height: 1;
        }
        .stat-label {
          font-size: 0.72rem;
          color: var(--dim);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
      `}</style>
    </div>
  );
}

export default function ResultsView({ result, audio, onReset }: Props) {
  const badFlags = result.flags.filter((f) => f.score < 0.45);
  const warnFlags = result.flags.filter((f) => f.score >= 0.45 && f.score < 0.75);
  const wordCount = result.transcript.trim().split(/\s+/).filter(Boolean).length;

  const downloadReport = () => {
    const lines = [
      `Phonix Pronunciation Report`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `Overall Score: ${result.overallScore}/100`,
      `Words: ${wordCount}`,
      `Mispronounced: ${badFlags.length}`,
      `Unclear: ${warnFlags.length}`,
      ``,
      `Transcript:`,
      result.transcript,
      ``,
      `Flagged Words:`,
      ...result.flags
        .filter((f) => f.score < 0.75)
        .map(
          (f) =>
            `- "${f.word}" (${Math.round(f.score * 100)}%): ${f.issue}\n  Expected IPA: ${f.expected_ipa}\n  Heard IPA:    ${f.actual_ipa}`
        ),
      ``,
      `AI Feedback:`,
      result.feedbackStream || "",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phonix-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rv-root">
      {/* Header */}
      <div className="rv-header">
        <div className="rv-title-row">
          <div className="rv-check">
            <CheckCircle size={16} />
          </div>
          <span className="rv-title">Analysis complete</span>
        </div>
        <div className="rv-actions">
          <button className="rv-btn rv-btn--ghost" onClick={downloadReport} aria-label="Download report">
            <Download size={15} />
            <span>Report</span>
          </button>
          <button className="rv-btn rv-btn--ghost" onClick={onReset} aria-label="Analyse another recording">
            <RotateCcw size={15} />
            <span>New recording</span>
          </button>
        </div>
      </div>

      {/* Score + stats row */}
      <div className="rv-score-row">
        <ScoreRing score={result.overallScore} size={140} />
        <div className="rv-stats">
          <StatPill label="Words" value={wordCount} />
          <StatPill
            label="Mispronounced"
            value={badFlags.length}
            color={badFlags.length > 0 ? "var(--bad)" : "var(--good)"}
          />
          <StatPill
            label="Unclear"
            value={warnFlags.length}
            color={warnFlags.length > 0 ? "var(--warn)" : "var(--good)"}
          />
        </div>
      </div>

      {/* Audio player */}
      <section className="rv-section">
        <h3 className="rv-section-title">Your recording</h3>
        <AudioPlayer audio={audio} />
      </section>

      {/* Transcript with highlights */}
      {result.transcript && (
        <section className="rv-section">
          <h3 className="rv-section-title">Transcript</h3>
          <div className="rv-transcript-box">
            <WordHighlight transcript={result.transcript} flags={result.flags} />
          </div>
        </section>
      )}

      {/* AI feedback */}
      {result.feedbackStream && (
        <section className="rv-section">
          <h3 className="rv-section-title">Feedback</h3>
          <FeedbackPanel text={result.feedbackStream} streaming={false} />
        </section>
      )}

      {/* Data notice */}
      <div className="rv-data-notice">
        <span>🔒</span>
        <span>Your audio has been deleted from our servers. Only a hashed reference remains in our audit log per DPDP 2023.</span>
      </div>

      <style>{`
        .rv-root {
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .rv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .rv-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .rv-check {
          width: 28px;
          height: 28px;
          background: var(--good-bg);
          border: 1px solid rgba(61,214,140,0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--good);
        }

        .rv-title {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 700;
          color: var(--heading);
        }

        .rv-actions {
          display: flex;
          gap: 8px;
        }

        .rv-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.83rem;
          font-family: var(--font-body);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--body);
        }

        .rv-btn--ghost:hover { background: var(--muted); color: var(--heading); }

        .rv-score-row {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 24px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          flex-wrap: wrap;
        }

        .rv-stats {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          flex: 1;
        }

        .rv-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .rv-section-title {
          font-family: var(--font-display);
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--dim);
        }

        .rv-transcript-box {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }

        .rv-data-notice {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.78rem;
          color: var(--dim);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
