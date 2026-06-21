"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Signin failed.");
      }

      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Signin failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen min-h-[100dvh] place-items-center bg-space-950 p-6">
      <form
        className="w-full max-w-[520px] rounded-lg border border-space-700 bg-space-900 p-8 shadow-panel"
        onSubmit={handleSubmit}
      >
        <div className="mb-8 flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyanline/50 bg-cyanline/20">
            <img
              src="/hyperce-logo.png"
              alt="Hyperce"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-normal">Hyperce Editor</h1>
            <p className="mt-1 text-sm text-muted">Sign in to continue</p>
          </div>
        </div>

        <label className="mb-5 block space-y-2 text-sm text-muted">
          Username or email
          <input
            className="field h-12 px-4 text-base"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className="mb-6 block space-y-2 text-sm text-muted">
          Password
          <input
            className="field h-12 px-4 text-base"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? (
          <div className="mb-4 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <button
          className="command-button command-primary min-h-12 w-full text-base font-semibold"
          disabled={submitting}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
          Sign In
        </button>
      </form>
    </main>
  );
}
