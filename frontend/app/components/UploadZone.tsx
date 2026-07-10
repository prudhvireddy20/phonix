"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Mic, FileAudio, AlertTriangle } from "lucide-react";
import type { AudioMeta } from "../types";
import { useAudioValidator, type ValidationError } from "../hooks/useAudioValidator";

interface Props {
  onValid: (audio: AudioMeta) => void;
}

export default function UploadZone({ onValid }: Props) {
  const { validate } = useAudioValidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setValidating(true);
    const result = await validate(file);
    setValidating(false);

    if ("kind" in result) {
      const err = result as ValidationError;
      setError(err.message);
      return;
    }

    onValid(result);
  }, [validate, onValid]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="upload-root">
      <div
        className={`upload-zone ${dragging ? "upload-zone--drag" : ""} ${validating ? "upload-zone--busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !validating && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska"
          onChange={onFileChange}
          style={{ display: "none" }}
          aria-hidden="true"
        />

        <div className="uz-icon">
          {validating ? (
            <div className="uz-spinner" />
          ) : dragging ? (
            <FileAudio size={32} />
          ) : (
            <Upload size={32} />
          )}
        </div>

        <p className="uz-heading">
          {validating ? "Checking audio…" : dragging ? "Drop to upload" : "Drop your recording here"}
        </p>
        <p className="uz-sub">
          {validating
            ? "Measuring duration and format"
            : "or click to browse — WAV, MP3, M4A, OGG, WebM, FLAC, MP4, MOV · up to 45 seconds"}
        </p>

        {!validating && (
          <div className="uz-hint">
            <Mic size={13} />
            <span>English speech only · Max 200 MB · Audio or video file</span>
          </div>
        )}
      </div>

      {error && (
        <div className="uz-error" role="alert">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      <style>{`
        .upload-root { display: flex; flex-direction: column; gap: 12px; }
        .upload-zone {
          border: 2px dashed var(--border);
          border-radius: 16px;
          padding: 48px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          text-align: center;
          background: var(--surface);
        }
        .upload-zone:hover:not(.upload-zone--busy) {
          border-color: var(--accent);
          background: var(--accent-glow);
        }
        .upload-zone--drag {
          border-color: var(--accent);
          background: var(--accent-glow);
        }
        .upload-zone--busy { cursor: wait; }
        .uz-icon {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          background: var(--panel);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          margin-bottom: 8px;
        }
        .uz-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--muted);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .uz-heading {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--heading);
        }
        .uz-sub { font-size: 0.85rem; color: var(--dim); }
        .uz-hint {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.78rem;
          color: var(--muted);
          margin-top: 4px;
        }
        .uz-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--bad-bg);
          border: 1px solid rgba(240,82,82,0.3);
          border-radius: 10px;
          color: var(--bad);
          font-size: 0.87rem;
        }
      `}</style>
    </div>
  );
}
