import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// ── Mock SSE stream matching the real FastAPI backend event schema ────────────

function mockSSEStream(referenceText: string) {
  const encoder = new TextEncoder();

  const transcript =
    referenceText ||
    "The quick brown fox jumps over the lazy dog near the river bank";

  const flags = [
    {
      word: "quick", ipa_expected: "kwɪk", ipa_actual: "kwɪək",
      start: 0.5, end: 0.9, score: 0.62,
      mistake_type: "mispronounced",
      suggestion: "Try pronouncing 'quick' as /kwɪk/ — the vowel is short, not gliding.",
    },
    {
      word: "jumps", ipa_expected: "dʒʌmps", ipa_actual: "dʒʌms",
      start: 2.1, end: 2.6, score: 0.38,
      mistake_type: "mispronounced",
      suggestion: "Try pronouncing 'jumps' as /dʒʌmps/ — keep both the /p/ and /s/ audible.",
    },
    {
      word: "lazy", ipa_expected: "ˈleɪzi", ipa_actual: "ˈlɛzi",
      start: 3.8, end: 4.3, score: 0.55,
      mistake_type: "unclear_segment",
      suggestion: "Almost right — listen for subtle differences in 'lazy' (ˈleɪzi).",
    },
  ];

  const feedbackTokens = [
    "Overall, your pronunciation is at a good intermediate level — most words came through clearly. ",
    "Your main challenge is with English diphthongs, like the gliding vowel /eɪ/ in 'lazy'. ",
    "Try holding the vowel a little longer and letting it glide to its second position.\n\n",
    "The word 'jumps' shows a common consonant-cluster reduction: the /p/ drops before the final /s/. ",
    "Slow the word down in practice, exaggerating the /ps/ until it becomes automatic.\n\n",
    "Your rhythm and sentence-level stress are strong — keep that up. ",
    "Focus your drilling on individual vowel quality rather than overall flow.",
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      await delay(300);
      emit({ type: "transcript", text: transcript });

      await delay(200);
      emit({ type: "score", overall: 74 });

      for (const flag of flags) {
        await delay(80);
        emit({ type: "flag", ...flag });
      }

      // Stream feedback tokens
      for (const token of feedbackTokens) {
        await delay(60 + Math.random() * 60);
        emit({ type: "feedback", token });
      }

      emit({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  const body = await req.json();

  if (!backendUrl) {
    return mockSSEStream(body.reference_text ?? "");
  }

  // Proxy to FastAPI, pass SSE stream through unchanged
  const upstream = await fetch(`${backendUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return NextResponse.json(err, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  });
}
