"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="text-sm font-medium uppercase tracking-wide text-sky-500/90">
        CAPN Security
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
        Sign in
      </h1>
      <p className="mt-3 text-zinc-500">
        Organization accounts use an{" "}
        <span className="text-zinc-400">@capnapp.com</span> email address.
      </p>
      <form
        onSubmit={onSubmit}
        className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-4 text-left"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Email
          </span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2.5 text-sm text-zinc-100"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Password
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2.5 text-sm text-zinc-100"
            required
          />
        </label>
        {error ? (
          <p className="text-sm text-amber-200/90" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
