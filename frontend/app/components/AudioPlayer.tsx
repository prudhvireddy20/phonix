"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { AudioMeta } from "../types";
import WaveformBar from "./WaveformBar";

interface Props {
  audio: AudioMeta;
}

export default function AudioPlayer({ audio }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.durationSeconds);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.src = audio.objectUrl;

    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnded);
    };
  }, [audio.objectUrl]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const restart = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play();
    setPlaying(true);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="audio-player">
      <audio ref={audioRef} preload="metadata" />

      <div className="ap-controls">
        <button className="ap-btn ap-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="ap-btn ap-restart" onClick={restart} aria-label="Restart">
          <RotateCcw size={14} />
        </button>
        <span className="ap-time">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>

      <div className="ap-wave">
        <WaveformBar
          file={audio.file}
          playing={playing}
          currentTime={currentTime}
          duration={duration}
        />
      </div>

      <style>{`
        .audio-player {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ap-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ap-btn {
          background: var(--muted);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--heading);
          transition: background 0.15s;
        }
        .ap-play { background: var(--accent); color: var(--ink); }
        .ap-play:hover { background: var(--accent-dim); }
        .ap-restart:hover { background: var(--border); }
        .ap-time {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          color: var(--dim);
          letter-spacing: 0.05em;
          margin-left: auto;
        }
      `}</style>
    </div>
  );
}
