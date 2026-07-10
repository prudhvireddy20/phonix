"use client";

import { useEffect, useRef } from "react";

interface Props {
  score: number; // 0–100
  size?: number;
}

function getColor(score: number) {
  if (score >= 80) return "var(--good)";
  if (score >= 55) return "var(--warn)";
  return "var(--bad)";
}

function getLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 35) return "Needs work";
  return "Struggling";
}

export default function ScoreRing({ score, size = 140 }: Props) {
  const circleRef = useRef<SVGCircleElement>(null);

  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getColor(score);
  const label = getLabel(score);

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    // Animate from 0 to score
    el.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)";
      el.style.strokeDashoffset = String(circumference * (1 - score / 100));
    });
  }, [score, circumference]);

  return (
    <div className="score-ring-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`Pronunciation score: ${score} out of 100 — ${label}`}
        role="img"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
        {/* Score number */}
        <text
          x={size / 2}
          y={size / 2 - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800 }}
        >
          {score}
        </text>
        {/* /100 */}
        <text
          x={size / 2}
          y={size / 2 + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--dim)"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
        >
          / 100
        </text>
      </svg>
      <span className="score-label" style={{ color }}>{label}</span>

      <style>{`
        .score-ring-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .score-label {
          font-family: var(--font-display);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
