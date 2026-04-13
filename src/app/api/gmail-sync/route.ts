import { execFile } from "node:child_process";
import { join } from "node:path";

import { NextResponse } from "next/server";

/**
 * Spawns `scripts/sync_gmail_to_neon.py` (incremental by default).
 *
 * - **Development** (no `GMAIL_SYNC_TRIGGER_SECRET`): POST is allowed from the browser.
 * - **Production**: set `GMAIL_SYNC_TRIGGER_SECRET` and send the same value in header
 *   `x-gmail-sync-secret` (browser pages cannot embed that secret safely). Prefer GitHub
 *   Actions, a private cron hitting this route, or local dev.
 */
export async function POST(request: Request) {
  const secret = process.env.GMAIL_SYNC_TRIGGER_SECRET?.trim();
  if (secret) {
    const hdr = request.headers.get("x-gmail-sync-secret")?.trim();
    if (hdr !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        skipped: true,
        reason:
          "In production, set GMAIL_SYNC_TRIGGER_SECRET and pass it as header x-gmail-sync-secret, or rely on scheduled CI sync.",
      },
      { status: 503 },
    );
  }

  const cwd = process.cwd();
  const script = join(cwd, "scripts", "sync_gmail_to_neon.py");
  const python = process.env.PYTHON_PATH?.trim() || "python3";

  try {
    const child = execFile(
      python,
      [script],
      {
        cwd,
        env: { ...process.env },
        detached: true,
        stdio: "ignore",
      },
      (err) => {
        if (err) {
          console.error("[gmail-sync]", err);
        }
      },
    );
    child.unref();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "spawn_failed", message }, { status: 500 });
  }

  return NextResponse.json({ started: true });
}
