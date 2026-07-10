"use client";

import { useCallback } from "react";
import type { AudioMeta } from "../types";

// ── Pure audio MIME types ─────────────────────────────────────────────────────
const ALLOWED_AUDIO_MIME = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
  "audio/x-aac",
]);

// ── Video MIME types whose audio track we extract via ffmpeg on the backend ───
// Browsers always report these as video/*, never audio/*.
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",          // .mp4 — phone/screen recordings, most common
  "video/quicktime",    // .mov — iPhone recordings
  "video/x-msvideo",   // .avi
  "video/webm",         // .webm video (distinct from audio/webm)
  "video/x-matroska",  // .mkv
]);

const ALLOWED_MIME = new Set([...ALLOWED_AUDIO_MIME, ...ALLOWED_VIDEO_MIME]);

const MIN_DURATION = 1;
const MAX_DURATION = 45;
// 200 MB ceiling — video/mp4 files are much larger than pure audio
const MAX_BYTES = 200 * 1024 * 1024;

export type ValidationError =
  | { kind: "mime"; message: string }
  | { kind: "size"; message: string }
  | { kind: "duration"; message: string; actual: number }
  | { kind: "decode"; message: string };

export function useAudioValidator() {
  const validate = useCallback(
    (file: File): Promise<AudioMeta | ValidationError> =>
      new Promise((resolve) => {
        // 1. MIME check (client-side; server re-validates)
        const mime = file.type.toLowerCase();
        if (!ALLOWED_MIME.has(mime)) {
          resolve({
            kind: "mime",
            message: `Unsupported format (${file.type || "unknown"}). ` +
              `Use WAV, MP3, M4A, OGG, WebM, FLAC, or MP4/MOV video.`,
          });
          return;
        }

        // 2. Size ceiling
        if (file.size > MAX_BYTES) {
          resolve({
            kind: "size",
            message: `File is too large (${(file.size / 1e6).toFixed(1)} MB). Max is 200 MB.`,
          });
          return;
        }

        // 3. Measure real duration via the browser's media decoder.
        //    HTMLVideoElement handles both audio and video files,
        //    so we use it instead of HTMLAudioElement for MP4/MOV support.
        const objectUrl = URL.createObjectURL(file);
        const media = document.createElement("video");
        media.preload = "metadata";
        media.src = objectUrl;
        media.muted = true;

        const cleanup = () => {
          media.src = "";
          media.load();
        };

        media.onloadedmetadata = () => {
          const dur = media.duration;
          cleanup();

          if (!isFinite(dur) || dur <= 0) {
            URL.revokeObjectURL(objectUrl);
            resolve({ kind: "decode", message: "Could not determine duration. Is this a valid media file?" });
            return;
          }

          if (dur < MIN_DURATION || dur > MAX_DURATION) {
            URL.revokeObjectURL(objectUrl);
            resolve({
              kind: "duration",
              message: `Recording must be up to 45 seconds. Yours is ${Math.round(dur)}s.`,
              actual: dur,
            });
            return;
          }

          // Valid — return meta (objectUrl stays alive for playback)
          const freshUrl = URL.createObjectURL(file);
          resolve({ file, durationSeconds: dur, objectUrl: freshUrl });
        };

        media.onerror = () => {
          cleanup();
          URL.revokeObjectURL(objectUrl);
          resolve({
            kind: "decode",
            message: "Could not read this file. Try a different format (MP4, MOV, WAV, MP3).",
          });
        };
      }),
    []
  );

  return { validate };
}
