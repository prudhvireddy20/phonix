import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Phonix",
  description:
    "How Phonix handles your audio data, personal information, and DPDP 2023 compliance.",
};

export default function PrivacyPage() {
  return (
    <div className="pp-page">
      {/* Ambient gradient */}
      <div className="pp-glow" aria-hidden="true" />

      {/* Header */}
      <header className="pp-header">
        <div className="pp-header-inner">
          <a href="/" className="pp-logo" aria-label="Phonix home">
            <span className="pp-logo-mark">φ</span>
            <span className="pp-logo-name">Phonix</span>
          </a>
          <span className="pp-header-tag">Privacy Policy</span>
        </div>
      </header>

      {/* Content */}
      <main className="pp-main">
        <div className="pp-container">
          <div className="pp-card">
            <h1 className="pp-title">Privacy Policy</h1>
            <p className="pp-updated">
              Last updated: July 2026 &middot; Effective immediately
            </p>

            <section className="pp-section">
              <h2>1. Who we are</h2>
              <p>
                Phonix is an English pronunciation coaching application built
                as a technical assessment project. This policy explains how
                we handle your data in compliance with India&apos;s{" "}
                <strong>
                  Digital Personal Data Protection Act, 2023 (DPDP)
                </strong>
                .
              </p>
            </section>

            <section className="pp-section">
              <h2>2. What data we collect</h2>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Purpose</th>
                      <th>Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Audio recording</td>
                      <td>Pronunciation analysis (transcription + phoneme scoring)</td>
                      <td>
                        <strong>Deleted immediately</strong> after analysis
                        completes. Failsafe: auto-purged within 1 hour.
                      </td>
                    </tr>
                    <tr>
                      <td>IP address</td>
                      <td>Rate limiting, abuse prevention</td>
                      <td>
                        <strong>SHA-256 hashed</strong> before storage. Raw IP is
                        never stored.
                      </td>
                    </tr>
                    <tr>
                      <td>Transcript text</td>
                      <td>Phoneme comparison, LLM feedback generation</td>
                      <td>
                        <strong>In-memory only</strong>. Never persisted to disk
                        or database.
                      </td>
                    </tr>
                    <tr>
                      <td>File reference</td>
                      <td>Audit trail for compliance</td>
                      <td>
                        <strong>SHA-256 hashed</strong>. Original filename/path
                        never stored.
                      </td>
                    </tr>
                    <tr>
                      <td>Consent record</td>
                      <td>DPDP compliance proof</td>
                      <td>Retained in audit log with hashed identifiers only.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pp-section">
              <h2>3. How we process your audio</h2>
              <div className="pp-flow">
                <div className="pp-flow-step">
                  <div className="pp-flow-num">1</div>
                  <div className="pp-flow-text">
                    <strong>On-device transcription</strong> — Your audio is
                    transcribed by faster-whisper running locally on our server.
                    Audio never leaves the processing server.
                  </div>
                </div>
                <div className="pp-flow-step">
                  <div className="pp-flow-num">2</div>
                  <div className="pp-flow-text">
                    <strong>Phoneme scoring</strong> — IPA conversion and
                    comparison happen entirely on-server using espeak-ng and
                    Levenshtein distance. No external API is called.
                  </div>
                </div>
                <div className="pp-flow-step">
                  <div className="pp-flow-num">3</div>
                  <div className="pp-flow-text">
                    <strong>LLM feedback</strong> — Only the{" "}
                    <em>text transcript and scores</em> are sent to an LLM
                    (via OpenRouter) for coaching feedback. Your audio is{" "}
                    <strong>never</strong> sent to any third party.
                  </div>
                </div>
                <div className="pp-flow-step">
                  <div className="pp-flow-num">4</div>
                  <div className="pp-flow-text">
                    <strong>Immediate deletion</strong> — Audio bytes are deleted
                    from the server the moment analysis completes. An audit log
                    entry (hashed references only) confirms deletion.
                  </div>
                </div>
              </div>
            </section>

            <section className="pp-section">
              <h2>4. Consent (DPDP §6)</h2>
              <p>
                Before any upload, you are presented with a consent dialog
                containing two options:
              </p>
              <ul className="pp-list">
                <li>
                  <strong>Essential processing</strong> (required) — Allows us to
                  transcribe and score your audio. Without this, the app cannot
                  function.
                </li>
                <li>
                  <strong>Anonymous analytics</strong> (optional) — Aggregated,
                  de-identified metrics such as score distributions. No audio or
                  transcript is retained. This is not pre-ticked.
                </li>
              </ul>
              <p>
                Refusing optional analytics has no effect on your pronunciation
                feedback.
              </p>
            </section>

            <section className="pp-section">
              <h2>5. Data residency</h2>
              <p>
                All processing occurs on the server hosting Phonix. The
                deployment operator chooses the server&apos;s physical location.
                No data is transferred to a different country for storage or
                processing. The only cross-border data flow is the text-only
                LLM API call for coaching feedback.
              </p>
            </section>

            <section className="pp-section">
              <h2>6. Sub-processors</h2>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Data shared</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>OpenRouter / LLM provider</td>
                      <td>Text transcript + scores only</td>
                      <td>Coaching feedback generation</td>
                    </tr>
                    <tr>
                      <td>Neon (managed PostgreSQL)</td>
                      <td>Hashed identifiers only</td>
                      <td>Audit log storage</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="pp-note">
                No sub-processor receives audio data. Whisper transcription and
                phoneme scoring are fully on-device.
              </p>
            </section>

            <section className="pp-section">
              <h2>7. Security measures</h2>
              <ul className="pp-list">
                <li>All PII (IP addresses, file keys) is SHA-256 hashed before any storage</li>
                <li>Rate limiting: 5 requests/minute per IP</li>
                <li>CORS restricted to configured origins</li>
                <li>Security headers: HSTS, X-Frame-Options, X-Content-Type-Options</li>
                <li>MIME type validation on both client and server</li>
                <li>File size limits enforced at both Nginx and application level</li>
              </ul>
            </section>

            <section className="pp-section">
              <h2>8. Your rights under DPDP 2023</h2>
              <ul className="pp-list">
                <li>
                  <strong>Right to access</strong> — Since we store only hashed
                  identifiers and no personal profiles, there is no personal data
                  to access.
                </li>
                <li>
                  <strong>Right to erasure</strong> — Audio is deleted
                  automatically within seconds of analysis. No manual request
                  is needed.
                </li>
                <li>
                  <strong>Right to withdraw consent</strong> — You may close the
                  browser at any time. Since no account or profile exists, no
                  further action is required.
                </li>
                <li>
                  <strong>Right to grievance redressal</strong> — Contact us at
                  the email below for any data-related concerns.
                </li>
              </ul>
            </section>

            <section className="pp-section">
              <h2>9. Contact</h2>
              <p>
                For privacy-related questions or concerns, contact the
                developer at:{" "}
                <strong>prudhvireddy [at] phonix-app</strong>.
              </p>
            </section>

            <div className="pp-back">
              <a href="/" className="pp-back-link">
                ← Back to Phonix
              </a>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .pp-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .pp-glow {
          position: fixed;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(245,166,35,0.07) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .pp-header {
          border-bottom: 1px solid var(--border);
          background: rgba(14,14,16,0.8);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .pp-header-inner {
          max-width: 760px;
          margin: 0 auto;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .pp-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }

        .pp-logo-mark {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--accent);
          line-height: 1;
        }

        .pp-logo-name {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--heading);
          letter-spacing: -0.02em;
        }

        .pp-header-tag {
          font-size: 0.78rem;
          color: var(--dim);
        }

        .pp-main {
          flex: 1;
          position: relative;
          z-index: 1;
        }

        .pp-container {
          max-width: 760px;
          margin: 0 auto;
          padding: 40px 20px 60px;
        }

        .pp-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pp-title {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 800;
          color: var(--heading);
          letter-spacing: -0.02em;
        }

        .pp-updated {
          font-size: 0.82rem;
          color: var(--dim);
          margin-bottom: 16px;
        }

        .pp-section {
          padding-top: 20px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pp-section h2 {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--heading);
        }

        .pp-section p {
          font-size: 0.9rem;
          color: var(--body);
          line-height: 1.7;
        }

        .pp-section strong { color: var(--heading); }

        .pp-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pp-list li {
          position: relative;
          padding-left: 20px;
          font-size: 0.9rem;
          color: var(--body);
          line-height: 1.7;
        }

        .pp-list li::before {
          content: "•";
          position: absolute;
          left: 0;
          color: var(--accent);
          font-weight: 700;
        }

        .pp-table-wrap {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .pp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }

        .pp-table th {
          text-align: left;
          padding: 12px 16px;
          background: var(--panel);
          color: var(--heading);
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          border-bottom: 1px solid var(--border);
        }

        .pp-table td {
          padding: 12px 16px;
          color: var(--body);
          border-bottom: 1px solid var(--border);
          line-height: 1.6;
        }

        .pp-table tr:last-child td {
          border-bottom: none;
        }

        .pp-note {
          font-size: 0.82rem;
          color: var(--dim);
          font-style: italic;
        }

        .pp-flow {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pp-flow-step {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 14px 16px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
        }

        .pp-flow-num {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-glow);
          border: 1px solid rgba(245,166,35,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--accent);
          flex-shrink: 0;
        }

        .pp-flow-text {
          font-size: 0.88rem;
          color: var(--body);
          line-height: 1.6;
        }

        .pp-flow-text em { color: var(--accent); font-style: normal; }

        .pp-back {
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        .pp-back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--body);
          text-decoration: none;
          transition: all 0.15s;
        }

        .pp-back-link:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-glow);
        }

        @media (max-width: 520px) {
          .pp-card { padding: 20px; }
          .pp-title { font-size: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
