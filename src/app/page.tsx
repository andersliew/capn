import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#0c0c0f] px-6 py-24 text-zinc-100">
      <main className="w-full max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-sky-500/90">
          CAPN dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
          Security operations
        </h1>
        <p className="mt-3 text-zinc-500">
          Neon-backed patrol dashboard with live reads from the database.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            Open dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
