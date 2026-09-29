"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // "Jobs" stays highlighted on a job's own page (/jobs/12).
  const isCurrent = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${
        isCurrent ? "bg-stone-100 text-stone-950" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
      }`}
    >
      {children}
    </Link>
  );
}
