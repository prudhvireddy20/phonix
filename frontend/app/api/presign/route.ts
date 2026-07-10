import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    // Dev mock — matches the real FastAPI response shape
    const body = await req.json();
    const mimeType = body.mime_type ?? "audio/webm";
    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm";
    return NextResponse.json({
      upload_url: "https://httpbin.org/put",
      file_key:   `audio/mock-${Date.now()}.${ext}`,
    });
  }

  const res = await fetch(`${backendUrl}/api/presign`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    req.body,
    // @ts-expect-error -- duplex needed for streaming body in Node fetch
    duplex:  "half",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
