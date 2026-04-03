"use client";

import Link from "next/link";
import { useState } from "react";
import { loginUser } from "@/app/actions/auth";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setError("");
    setIsSubmitting(true);

    const result = await loginUser(formData);
    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="logo">
            Axiom
          </Link>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/onboarding" className="nav-link">
              Get Started
            </Link>
            <Link href="/login" className="nav-link active">
              Login
            </Link>
          </div>
        </div>
      </header>
      <div style={{ height: 60 }} />

      <main
        className="container"
        style={{ flex: 1, paddingTop: 40, paddingBottom: 72 }}
      >
        <section
          className="section-rule"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 56,
            paddingTop: 42,
            paddingBottom: 52,
          }}
        >
          <div>
            <div className="meta-text" style={{ marginBottom: 10 }}>
              Authentication
            </div>
            <h1 style={{ fontSize: 44, lineHeight: 1.12, marginBottom: 18 }}>
              Resume your
              <br />
              schedule state.
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: 440 }}>
              Enter your credentials to restore your active planning state,
              bandwidth assumptions, and current task routing.
            </p>

            <div
              className="meta-text"
              style={{
                borderTop: "0.5px solid var(--rule)",
                marginTop: 22,
                paddingTop: 14,
                display: "grid",
                gap: 8,
              }}
            >
              <div>[1] Session auth via signed token</div>
              <div>[2] Dashboard route protected by proxy</div>
              <div>[3] Deterministic state restoration</div>
            </div>
          </div>

          <div style={{ borderTop: "0.5px solid var(--ink)", paddingTop: 14 }}>
            <div className="meta-text" style={{ marginBottom: 16 }}>
              Credentials
            </div>

            <form action={handleSubmit} style={{ display: "grid", gap: 16 }}>
              <div>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>

              {error && (
                <p style={{ color: "var(--warning)", fontSize: 12 }}>
                  [!] {error}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{ opacity: isSubmitting ? 0.55 : 1 }}
                >
                  {isSubmitting ? "Authenticating..." : "Login"}
                </button>
                <Link href="/onboarding" className="btn">
                  New User Setup
                </Link>
              </div>
            </form>
          </div>
        </section>

        <section style={{ paddingTop: 24 }}>
          <p className="meta-text">
            No decorative motion. No hidden steps. Direct auth to dashboard
            state.
          </p>
        </section>
      </main>
    </div>
  );
}
