"use client";

import Link from "next/link";
import type { DocSummary } from "@/lib/store";
import { expiryLabel, type ExpiryStatus } from "@/lib/expiry-label";
import ManageButton from "./manage-button";

interface DocListProps {
  docs: DocSummary[];
  now: number;
}

const STATUS_CLASS: Record<ExpiryStatus, string> = {
  permanent: "text-ink-3",
  active: "text-ink-3",
  soon: "text-toss-red",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default function DocList({ docs, now }: DocListProps) {
  if (docs.length === 0) {
    return (
      <div className="mt-8 rounded-card bg-white p-10 text-center text-ink-3 shadow-card">
        아직 등록된 문서가 없습니다
        <div className="mt-3">
          <Link href="/" className="font-semibold text-toss-blue">
            문서 올리러 가기 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-6 flex flex-col gap-2">
      {docs.map((doc) => {
        const expiry = expiryLabel(doc.expiresAt, now);
        return (
          <li
            key={doc.id}
            className="rounded-2xl bg-white p-4 shadow-card transition-shadow hover:shadow-[0_10px_28px_rgba(16,24,40,0.12)]"
          >
            <div className="flex items-center justify-between gap-3">
              <a
                href={`/d/${doc.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-ink hover:text-toss-blue"
              >
                {doc.isLocked && <span title="열람 잠금" aria-label="열람 잠금">🔒</span>}
                <span className="truncate">{doc.name}</span>
              </a>
              <ManageButton id={doc.id} name={doc.name} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
              <span>등록 {formatDate(doc.createdAt)}</span>
              <span className={STATUS_CLASS[expiry.status]}>만료 {expiry.text}</span>
              <span>조회 {doc.views}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
