import type { Metadata } from "next";
import { listDocs } from "@/lib/store";
import DocList from "./doc-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "문서 목록 · TTL HTML Share",
  robots: { index: false, follow: false },
};

async function loadDocs() {
  const now = Date.now();
  return { now, docs: await listDocs(now) };
}

export default async function DocsPage() {
  const { now, docs } = await loadDocs();

  return (
    <main className="mx-auto max-w-2xl px-5 pt-10 pb-16">
      <h1 className="text-2xl font-bold">문서 목록</h1>
      <p className="mt-1 text-ink-3">등록된 문서 {docs.length}개</p>
      <DocList docs={docs} now={now} />
    </main>
  );
}
