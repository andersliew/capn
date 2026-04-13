"use client";

/** Root `<body>` as a client component so extension-injected attributes hydrate cleanly. */
export function RootBody({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <body className={className} suppressHydrationWarning>
      {children}
    </body>
  );
}
