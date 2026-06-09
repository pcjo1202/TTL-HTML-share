import Link from "next/link";
import type { Metadata } from "next";
import TabNav from "../tab-nav";
import { listDocs } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "문서 목록 · TTL HTML Share",
  robots: { index: false, follow: false },
};

const DAY = 24 * 60 * 60 * 1000;

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
}

function dday(expiresAt: number | "never", now: number): string {
  if (expiresAt === "never") return "영구";
  const days = Math.ceil((expiresAt - now) / DAY);
  return days <= 0 ? "곧 만료" : `D-${days}`;
}

async function loadDocs() {
  const now = Date.now();
  return { now, docs: await listDocs(now) };
}

export default async function DocsPage() {
  const { now, docs } = await loadDocs();

  return (
    <>
      <TabNav />
      <main className="mx-auto max-w-2xl px-5 pt-8 pb-12">
        <h1 className="text-2xl font-bold">문서 목록</h1>
        <p className="mt-1 text-ink-3">등록된 문서 {docs.length}개</p>

        {docs.length === 0 ? (
          <div className="mt-8 rounded-[20px] bg-white p-10 text-center text-ink-3 shadow-sm">
            아직 등록된 문서가 없습니다
            <div className="mt-3">
              <Link href="/" className="font-semibold text-toss-blue">
                문서 올리러 가기 →
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={`/d/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-semibold text-ink hover:text-toss-blue"
                  >
                    {d.name}
                  </a>
                  <Link
                    href={`/d/${d.id}/manage`}
                    className="shrink-0 rounded-lg bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink-2"
                  >
                    관리
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span>등록 {fmtDate(d.createdAt)}</span>
                  <span>만료 {dday(d.expiresAt, now)}</span>
                  <span>조회 {d.views}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
