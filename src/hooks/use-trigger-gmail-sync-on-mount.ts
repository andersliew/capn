"use client";

import { useEffect, useRef } from "react";

/**
 * Fire-and-forget incremental Gmail → Neon sync when the app loads.
 * The API runs the Python script in the background (local dev) or returns 503 in production
 * until `GMAIL_SYNC_TRIGGER_SECRET` is configured for authenticated calls.
 */
let triggeredThisSession = false;

export function useTriggerGmailSyncOnMount() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || triggeredThisSession) {
      return;
    }
    ran.current = true;
    triggeredThisSession = true;
    void fetch("/api/gmail-sync", { method: "POST" }).catch(() => {});
  }, []);
}
