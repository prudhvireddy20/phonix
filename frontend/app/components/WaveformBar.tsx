"use client";

import { useEffect, useRef } from "react";

interface Props {
  file: File;
  playing?: boolean;
  currentTime?: number;
  duration?: number;
}

export default function WaveformBar({ file, playing = false, currentTime = 0, duration = 1 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function decode() {
      const ctx = new AudioContext();
      const buf = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(buf);
      ctx.close();

      const data = audioBuffer.getChannelData(0);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const NUM_BARS = Math.floor(canvas.clientWidth / 3);
      const step = Math.floor(data.length / NUM_BARS);
      const bars: number[] = [];

      for (let i = 0; i < NUM_BARS; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
          const v = Math.abs(data[i * step + j] || 0);
          if (v > max) max = v;
        }
        bars.push(max);
      }

      barsRef.current = bars;
      draw(canvas, bars, 0, 1);
    }

    decode().catch(() => {});
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || barsRef.current.length === 0) return;
    draw(canvas, barsRef.current, currentTime, duration);
  }, [currentTime, duration]);

  function draw(canvas: HTMLCanvasElement, bars: number[], ct: number, dur: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, W, H);

    const progress = dur > 0 ? ct / dur : 0;
    const barW = 2;
    const gap = 1;

    bars.forEach((amp, i) => {
      const x = i * (barW + gap);
      const barH = Math.max(2, amp * H * 0.85);
      const y = (H - barH) / 2;
      const isPlayed = i / bars.length <= progress;
      ctx.fillStyle = isPlayed ? "#F5A623" : "#2A2A30";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 1);
      ctx.fill();
    });
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "64px", display: "block" }}
    />
  );
}
