"use client";

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
};

/** Native `type="date"` with the browser’s own calendar control and dark `color-scheme`. */
export function DateField({ label, value, onChange, min, max }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        type="date"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ colorScheme: "dark" }}
        suppressHydrationWarning
        className="min-h-[42px] w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#141419] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80"
      />
    </div>
  );
}
