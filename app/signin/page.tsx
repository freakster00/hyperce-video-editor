"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, LockKeyhole } from "lucide-react";

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
    <main className="grid min-h-screen min-h-[100dvh] place-items-center bg-space-950 p-4">
      <form
        className="w-full max-w-sm rounded-lg border border-space-700 bg-space-900 p-5 shadow-panel"
        onSubmit={handleSubmit}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyanline/40 bg-space-950">
            <Film size={18} className="text-cyanline" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold tracking-normal">Hyperce Editor</h1>
            <p className="text-xs text-muted">Sign in to continue</p>
          </div>
        </div>

        <label className="mb-3 block space-y-1 text-xs text-muted">
          Username or email
          <input
            className="field h-10 px-3 text-sm"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className="mb-4 block space-y-1 text-xs text-muted">
          Password
          <input
            className="field h-10 px-3 text-sm"
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
          className="command-button command-primary min-h-11 w-full text-sm font-semibold"
          disabled={submitting}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
          Sign In
        </button>
      </form>
    </main>
  );
}
