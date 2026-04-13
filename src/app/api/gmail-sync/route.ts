import { spawn } from "node:child_process";
import { join } from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import {
  dispatchGmailSyncWorkflow,
  isGmailSyncDispatchConfigured,
} from "@/lib/gmail-sync-trigger";

function isProductionLike(): boolean {
  return (
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
  );
}

/** Browser or cron may trigger; avoid anonymous workflow spam. */
async function isAuthorizedToTrigger(request: Request): Promise<boolean> {
  const secret = process.env.GMAIL_SYNC_TRIGGER_SECRET?.trim();
  if (secret) {
    const hdr = request.headers.get("x-gmail-sync-secret")?.trim();
    if (hdr === secret) {
      return true;
    }
  }
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return (await verifySessionToken(token)) != null;
}

/**
 * Starts incremental Gmail → Neon sync.
 *
 * - **Local dev**: spawns `python3 scripts/sync_gmail_to_neon.py` (incremental unless `GMAIL_SYNC_FULL=1`).
 * - **Vercel / production**: cannot run Python; set `GITHUB_SYNC_TOKEN` + `GITHUB_SYNC_REPO` to dispatch
 *   the `gmail-sync.yml` workflow (still incremental on GitHub — no `--full` in the workflow).
 */
export async function POST(request: Request) {
  const authorized = await isAuthorizedToTrigger(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isProductionLike()) {
    if (!isGmailSyncDispatchConfigured()) {
      return NextResponse.json(
        {
          skipped: true,
          reason:
            "Production cannot run Python here. Set GITHUB_SYNC_TOKEN and GITHUB_SYNC_REPO to dispatch the Gmail sync workflow, or rely on the scheduled workflow only.",
        },
        { status: 503 },
      );
    }

    const result = await dispatchGmailSyncWorkflow();
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "workflow_dispatch_failed",
          status: result.status,
          message: result.message,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ dispatched: true });
  }

  const cwd = process.cwd();
  const script = join(cwd, "scripts", "sync_gmail_to_neon.py");
  const python = process.env.PYTHON_PATH?.trim() || "python3";

  try {
    const child = spawn(python, [script], {
      cwd,
      env: { ...process.env },
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err: Error) => {
      console.error("[gmail-sync]", err);
    });
    child.unref();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "spawn_failed", message }, { status: 500 });
  }

  return NextResponse.json({ started: true });
}
