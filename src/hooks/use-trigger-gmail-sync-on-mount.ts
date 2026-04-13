"use client";

import { useEffect, useRef } from "react";

/**
 * Fire-and-forget **incremental** Gmail → Neon sync when the dashboard mounts.
 *
 * - **Local dev**: API spawns `sync_gmail_to_neon.py` (uses `gmail_sync_state`, not a full re-list unless you set `GMAIL_SYNC_FULL`).
 * - **Production (Vercel)**: API dispatches the GitHub Action when `GITHUB_SYNC_TOKEN` + `GITHUB_SYNC_REPO` are set;
 *   your session cookie authorizes the request (no secret in the browser).
 */
export function useTriggerGmailSyncOnMount() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    void fetch("/api/gmail-sync", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);
}
