import "server-only";

/**
 * Dispatches the repo’s Gmail sync workflow (incremental by default — same as local `python scripts/sync_gmail_to_neon.py`).
 * Intended for Vercel/production where the Next.js runtime cannot run Python or hold Gmail credentials.
 */
export function isGmailSyncDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_SYNC_TOKEN?.trim() &&
      process.env.GITHUB_SYNC_REPO?.trim(),
  );
}

export async function dispatchGmailSyncWorkflow(): Promise<{
  ok: boolean;
  status?: number;
  message?: string;
}> {
  const token = process.env.GITHUB_SYNC_TOKEN?.trim();
  const repo = process.env.GITHUB_SYNC_REPO?.trim();
  const workflowFile =
    process.env.GITHUB_SYNC_WORKFLOW_FILE?.trim() || "gmail-sync.yml";
  const ref = process.env.GITHUB_SYNC_REF?.trim() || "main";

  if (!token || !repo) {
    return { ok: false, message: "GITHUB_SYNC_TOKEN or GITHUB_SYNC_REPO missing" };
  }

  const parts = repo.split("/").filter(Boolean);
  if (parts.length !== 2) {
    return { ok: false, message: "GITHUB_SYNC_REPO must be owner/repo" };
  }
  const [owner, name] = parts;

  const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref }),
  });

  if (res.status === 204) {
    return { ok: true, status: 204 };
  }

  const body = await res.text();
  return {
    ok: false,
    status: res.status,
    message: body.slice(0, 500),
  };
}
