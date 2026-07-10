"use client";

import { useEffect, useState } from "react";

const STAGES = [
  { id: "transcode", label: "Transcoding to 16kHz WAV", icon: "🎙" },
  { id: "transcribe", label: "Transcribing with Whisper", icon: "📝" },
  { id: "phonemes", label: "Extracting IPA phonemes", icon: "🔤" },
  { id: "diff", label: "Computing Levenshtein diff", icon: "📊" },
  { id: "feedback", label: "Generating AI feedback", icon: "✨" },
];

interface Props {
  partialFeedback?: string;
}

export default function AnalyzingScreen({ partialFeedback = "" }: Props) {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    // If feedback is streaming, jump to last stage
    if (partialFeedback.length > 0) {
      setStageIdx(STAGES.length - 1);
      return;
    }

    const timer = setInterval(() => {
      setStageIdx((s) => Math.min(s + 1, STAGES.length - 2));
    }, 2800);

    return () => clearInterval(timer);
  }, [partialFeedback]);

  return (
    <div className="as-root">
      <div className="as-animation">
        <div className="as-rings">
          <div className="as-ring as-ring--1" />
          <div className="as-ring as-ring--2" />
          <div className="as-ring as-ring--3" />
          <div className="as-core">
            <span className="as-core-icon">{STAGES[stageIdx].icon}</span>
          </div>
        </div>
      </div>

      <div className="as-stages">
        {STAGES.map((stage, i) => (
          <div
            key={stage.id}
            className={`as-stage ${
              i < stageIdx
                ? "as-stage--done"
                : i === stageIdx
                ? "as-stage--active"
                : "as-stage--pending"
            }`}
          >
            <div className="as-stage-dot">
              {i < stageIdx ? "✓" : i === stageIdx ? <span className="as-dot-pulse" /> : ""}
            </div>
            <span className="as-stage-label">{stage.label}</span>
          </div>
        ))}
      </div>

      {partialFeedback && (
        <div className="as-preview">
          <p>{partialFeedback}</p>
          <span className="as-preview-cursor" />
        </div>
      )}

      <style>{`
        .as-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          padding: 40px 0;
        }

        .as-animation { position: relative; width: 120px; height: 120px; }

        .as-rings {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .as-ring {
          position: absolute;
          border-radius: 50%;
          border: 1.5px solid var(--accent);
          opacity: 0.3;
          animation: expandFade 2.4s ease-out infinite;
        }

        .as-ring--1 { width: 120px; height: 120px; animation-delay: 0s; }
        .as-ring--2 { width: 120px; height: 120px; animation-delay: 0.8s; }
        .as-ring--3 { width: 120px; height: 120px; animation-delay: 1.6s; }

        @keyframes expandFade {
          0%   { transform: scale(0.3); opacity: 0.5; }
          100% { transform: scale(1);   opacity: 0; }
        }

        .as-core {
          width: 56px;
          height: 56px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          z-index: 1;
          box-shadow: 0 0 24px var(--accent-glow);
        }

        .as-stages {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 340px;
        }

        .as-stage {
          display: flex;
          align-items: center;
          gap: 12px;
          transition: opacity 0.3s;
        }

        .as-stage--pending { opacity: 0.3; }
        .as-stage--done    { opacity: 0.6; }
        .as-stage--active  { opacity: 1; }

        .as-stage-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--panel);
          border: 1.5px solid var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--good);
          font-weight: 700;
          flex-shrink: 0;
        }

        .as-stage--active .as-stage-dot {
          border-color: var(--accent);
          box-shadow: 0 0 8px var(--accent-glow);
        }

        .as-dot-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.4); }
        }

        .as-stage-label {
          font-size: 0.87rem;
          color: var(--body);
        }

        .as-stage--done .as-stage-label { color: var(--dim); }
        .as-stage--active .as-stage-label { color: var(--heading); font-weight: 600; }

        .as-preview {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 0.85rem;
          color: var(--dim);
          line-height: 1.65;
          max-height: 120px;
          overflow: hidden;
          position: relative;
        }

        .as-preview-cursor {
          display: inline-block;
          width: 2px;
          height: 0.9em;
          background: var(--accent);
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink 0.9s step-end infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
