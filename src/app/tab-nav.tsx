"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "업로드" },
  { href: "/docs", label: "문서 목록" },
] as const;

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-2xl gap-1 px-5 pt-6">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              active ? "bg-toss-blue text-white" : "text-ink-3 hover:bg-bg-2"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
