"use client";

import { useCallback, useRef, useState } from "react";
import type { AnalysisResult, AudioMeta, ConsentState } from "../types";

type AnalysisState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "analyzing"; partialFeedback: string }
  | { status: "done"; result: AnalysisResult }
  | { status: "error"; message: string };

export function useAnalysis(backendUrl: string) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (audio: AudioMeta, referenceText: string, consent: ConsentState) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // ── Step 1: Get presigned URL ──────────────────────────────────────
        setState({ status: "uploading", progress: 0 });

        const presignRes = await fetch(`${backendUrl}/api/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: {
              essential_processing: consent.essential,
              analytics_consent:    consent.analytics,
            },
            mime_type: audio.file.type || "audio/webm",
          }),
          signal: controller.signal,
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          throw new Error(err.detail || `Presign failed (${presignRes.status})`);
        }

        const { upload_url, file_key } = await presignRes.json();

        // ── Step 2: PUT audio directly to Supabase Storage ────────────────
        setState({ status: "uploading", progress: 30 });

        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": audio.file.type || "audio/webm" },
          body: audio.file,
          signal: controller.signal,
        });

        if (!putRes.ok) {
          throw new Error(`Upload failed (${putRes.status})`);
        }

        setState({ status: "uploading", progress: 85 });

        // ── Step 3: Trigger analysis pipeline (SSE stream) ────────────────
        setState({ status: "analyzing", partialFeedback: "" });

        const analyzeRes = await fetch(`${backendUrl}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_key, reference_text: referenceText }),
          signal: controller.signal,
        });

        if (!analyzeRes.ok) {
          const err = await analyzeRes.json().catch(() => ({}));
          throw new Error(err.detail || `Analysis failed (${analyzeRes.status})`);
        }

        // ── Step 4: Parse SSE event stream ────────────────────────────────
        let transcript     = "";
        let overallScore   = 0;
        let feedbackText   = "";
        const flags: AnalysisResult["flags"] = [];

        const reader  = analyzeRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (raw === "" || raw === "[DONE]") continue;

            let evt: Record<string, unknown>;
            try { evt = JSON.parse(raw); }
            catch { continue; }

            switch (evt.type) {
              case "transcript":
                transcript = evt.text as string;
                break;

              case "score":
                overallScore = evt.overall as number;
                break;

              case "flag":
                flags.push({
                  word:          evt.word          as string,
                  wordIndex:     flags.length,              // positional index
                  expected_ipa:  evt.ipa_expected   as string,
                  actual_ipa:    evt.ipa_actual      as string,
                  score:         evt.score          as number,
                  issue:         (evt.suggestion    as string) ||
                                 (evt.mistake_type  as string),
                });
                break;

              case "feedback":
                feedbackText += evt.token as string;
                setState({ status: "analyzing", partialFeedback: feedbackText });
                break;

              case "feedback_error":
                // LLM feedback failed but scoring is intact — continue to done
                console.warn("LLM feedback unavailable:", evt.message);
                break;

              case "done":
                setState({
                  status: "done",
                  result: {
                    overallScore,
                    transcript,
                    referenceText,
                    flags,
                    feedbackStream: feedbackText,
                  },
                });
                return;

              case "error":
                throw new Error((evt.message as string) || "Pipeline error");
            }
          }
        }

        // Stream ended without a "done" event — treat as complete
        setState({
          status: "done",
          result: { overallScore, transcript, referenceText, flags, feedbackStream: feedbackText },
        });

      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setState({
          status: "error",
          message: (err as Error).message || "Something went wrong. Please try again.",
        });
      }
    },
    [backendUrl]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}
