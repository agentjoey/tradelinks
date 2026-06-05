"use client";
import type { ReactNode } from "react";
import { track } from "../lib/track";

/** External link that fires a GA4 custom event on click (client island so the
 * parent can stay a server component). */
export function TrackedLink({
  href,
  event,
  params,
  className,
  children,
}: {
  href: string;
  event: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track(event, params)}
    >
      {children}
    </a>
  );
}
