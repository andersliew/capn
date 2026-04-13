"use client";

import { useRef } from "react";

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        stroke="currentColor"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
};

/**
 * Native `type="date"` with calendar icon; opens the browser date picker on icon click
 * (`showPicker()` where supported) and uses dark `color-scheme` for the popup.
 */
export function DateField({ label, value, onChange, min, max }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
      el.click();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex min-h-[42px] items-stretch overflow-hidden rounded-lg border border-white/[0.08] bg-[#141419] focus-within:border-sky-500/40 focus-within:ring-1 focus-within:ring-sky-500/20">
        <button
          type="button"
          onClick={openPicker}
          className="flex shrink-0 items-center justify-center border-r border-white/[0.06] bg-white/[0.03] px-2.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
          title="Open calendar"
          aria-label={`Open calendar for ${label}`}
        >
          <CalendarIcon className="text-sky-500/90" />
        </button>
        <input
          ref={inputRef}
          type="date"
          value={value ?? ""}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value || null)}
          style={{ colorScheme: "dark" }}
          suppressHydrationWarning
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80"
        />
      </div>
    </div>
  );
}
