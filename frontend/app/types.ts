export type ConsentState = {
  essential: boolean;   // required
  analytics: boolean;   // optional
};

export type UploadPhase =
  | "idle"
  | "consent"
  | "validating"
  | "uploading"
  | "analyzing"
  | "done"
  | "error";

export type PhonemeFlag = {
  word: string;
  wordIndex: number;
  expected_ipa: string;
  actual_ipa: string;
  score: number;          // 0–1
  issue: string;          // human description
};

export type AnalysisResult = {
  overallScore: number;       // 0–100
  transcript: string;
  referenceText: string;
  flags: PhonemeFlag[];
  feedbackStream?: string;    // accumulated SSE text
};

export type AudioMeta = {
  file: File;
  durationSeconds: number;
  objectUrl: string;
};
