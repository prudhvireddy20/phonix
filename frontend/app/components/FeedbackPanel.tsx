"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  text: string;
  streaming?: boolean;
}

export default function FeedbackPanel({ text, streaming = false }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [text, streaming]);

  return (
    <div className="fp-root">
      <div className="fp-header">
        <Sparkles size={16} />
        <span>AI Feedback</span>
        {streaming && <span className="fp-live">Live</span>}
      </div>

      <div className="fp-body" aria-live="polite" aria-label="AI pronunciation feedback">
        <p className="fp-text">
          {text}
          {streaming && <span className="fp-cursor" aria-hidden="true" />}
        </p>
        <div ref={endRef} />
      </div>

      <style>{`
        .fp-root {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .fp-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .fp-live {
          margin-left: auto;
          background: rgba(245,166,35,0.15);
          color: var(--accent);
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 20px;
          border: 1px solid rgba(245,166,35,0.3);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .fp-body {
          padding: 20px;
          max-height: 320px;
          overflow-y: auto;
        }

        .fp-text {
          font-size: 0.92rem;
          color: var(--body);
          line-height: 1.75;
          white-space: pre-wrap;
        }

        .fp-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
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
