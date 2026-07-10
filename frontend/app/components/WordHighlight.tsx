"use client";

import { useState } from "react";
import type { PhonemeFlag } from "../types";

interface Props {
  transcript: string;
  flags: PhonemeFlag[];
}

function getSeverityClass(score: number) {
  if (score >= 0.75) return "word--ok";
  if (score >= 0.45) return "word--warn";
  return "word--bad";
}

function getScoreColor(score: number) {
  if (score >= 0.75) return "var(--good)";
  if (score >= 0.45) return "var(--warn)";
  return "var(--bad)";
}

export default function WordHighlight({ transcript, flags }: Props) {
  const [active, setActive] = useState<PhonemeFlag | null>(null);

  // Build a map: wordIndex → flag
  const flagMap = new Map<number, PhonemeFlag>();
  flags.forEach((f) => flagMap.set(f.wordIndex, f));

  const words = transcript.split(/(\s+)/);
  let wordIdx = 0;

  const tokens = words.map((token, i) => {
    if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

    const idx = wordIdx++;
    const flag = flagMap.get(idx);

    if (!flag || flag.score >= 0.9) {
      return (
        <span key={i} className="word word--good">
          {token}
        </span>
      );
    }

    const cls = getSeverityClass(flag.score);
    return (
      <button
        key={i}
        className={`word ${cls}`}
        onClick={() => setActive(active?.wordIndex === flag.wordIndex ? null : flag)}
        aria-expanded={active?.wordIndex === flag.wordIndex}
        aria-label={`${token}: ${flag.issue}`}
      >
        {token}
        <span
          className="word-dot"
          style={{ background: getScoreColor(flag.score) }}
        />
      </button>
    );
  });

  return (
    <div className="wh-root">
      <p className="wh-transcript">{tokens}</p>

      {active && (
        <div className="wh-tooltip" role="status">
          <div className="wh-tt-header">
            <span className="wh-tt-word">{active.word}</span>
            <span
              className="wh-tt-score"
              style={{ color: getScoreColor(active.score) }}
            >
              {Math.round(active.score * 100)}%
            </span>
          </div>

          <div className="wh-tt-ipa">
            <div className="ipa-row">
              <span className="ipa-label">Expected</span>
              <span className="ipa-val ipa-val--expected">{active.expected_ipa || "—"}</span>
            </div>
            <div className="ipa-row">
              <span className="ipa-label">Heard</span>
              <span className="ipa-val ipa-val--actual">{active.actual_ipa || "—"}</span>
            </div>
          </div>

          <p className="wh-tt-issue">{active.issue}</p>

          <button
            className="wh-tt-close"
            onClick={() => setActive(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="wh-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "var(--good)" }} />
          Clear
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "var(--warn)" }} />
          Unclear
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "var(--bad)" }} />
          Mispronounced
        </span>
        <span className="legend-hint">Tap a word for details</span>
      </div>

      <style>{`
        .wh-root { display: flex; flex-direction: column; gap: 16px; }

        .wh-transcript {
          font-size: 1.05rem;
          line-height: 2.1;
          color: var(--body);
          word-break: break-word;
        }

        .word {
          display: inline;
          position: relative;
          border: none;
          background: none;
          font: inherit;
          color: inherit;
          padding: 0 0 2px;
          cursor: default;
        }

        .word--good { color: var(--body); }

        .word--warn,
        .word--bad {
          cursor: pointer;
          border-radius: 4px;
          padding: 1px 3px;
          transition: background 0.15s;
        }

        .word--warn {
          background: var(--warn-bg);
          color: var(--warn);
          text-decoration: underline;
          text-decoration-style: wavy;
          text-underline-offset: 3px;
          text-decoration-color: var(--warn);
        }

        .word--bad {
          background: var(--bad-bg);
          color: var(--bad);
          text-decoration: underline;
          text-decoration-style: wavy;
          text-underline-offset: 3px;
          text-decoration-color: var(--bad);
        }

        .word--warn:hover { background: rgba(245,166,35,0.2); }
        .word--bad:hover  { background: rgba(240,82,82,0.2); }

        .word-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          margin-left: 2px;
          vertical-align: super;
          flex-shrink: 0;
        }

        .wh-tooltip {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: slideDown 0.18s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .wh-tt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .wh-tt-word {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--heading);
        }

        .wh-tt-score {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          font-weight: 700;
        }

        .wh-tt-ipa {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: var(--surface);
          border-radius: 8px;
          padding: 12px;
        }

        .ipa-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ipa-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--dim);
          width: 56px;
          flex-shrink: 0;
        }

        .ipa-val {
          font-family: var(--font-mono);
          font-size: 0.95rem;
          letter-spacing: 0.03em;
        }

        .ipa-val--expected { color: var(--good); }
        .ipa-val--actual   { color: var(--bad); }

        .wh-tt-issue {
          font-size: 0.88rem;
          color: var(--body);
          line-height: 1.5;
        }

        .wh-tt-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: var(--dim);
          cursor: pointer;
          font-size: 0.8rem;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .wh-tt-close:hover { background: var(--muted); color: var(--heading); }

        .wh-legend {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          padding-top: 4px;
          border-top: 1px solid var(--border);
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.78rem;
          color: var(--dim);
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .legend-hint {
          font-size: 0.75rem;
          color: var(--muted);
          margin-left: auto;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
