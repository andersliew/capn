"use client";

import { useState } from "react";

const PREVIEW_CHARS = 280;

type Props = {
  text: string | null;
};

export function ReportDetailsCell({ text }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!text?.trim()) {
    return <span className="text-zinc-600">—</span>;
  }

  const isLong = text.length > PREVIEW_CHARS;
  const display =
    expanded || !isLong ? text : `${text.slice(0, PREVIEW_CHARS)}…`;

  return (
    <div className="max-w-md">
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">
        {display}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs font-medium text-sky-500/90 hover:text-sky-400"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
