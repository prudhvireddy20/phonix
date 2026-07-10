import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phonix — Pronunciation Coach",
  description:
    "Upload a 30–45s English recording. Get a pronunciation score, phoneme-level highlights, and actionable feedback.",
  keywords: ["pronunciation", "English", "speech", "IPA", "phoneme", "coach"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
