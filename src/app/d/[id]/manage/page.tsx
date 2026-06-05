"use client";

import { use, useState } from "react";

export default function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: "extend" | "delete", ttl?: string) {
    setMsg(null);
    const res = await fetch(`/api/manage/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action, ttl }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg(json.error ?? "오류가 발생했습니다.");
    setMsg(action === "delete" ? "삭제되었습니다." : "유효기간이 갱신되었습니다.");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">문서 관리</h1>
      <p className="mt-1 text-sm text-ink-3">/d/{id}</p>

      <label className="mt-6 block text-xs font-semibold text-ink-2">관리 비밀번호</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="업로드 때 정한 비밀번호"
        className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3"
      />

      <div className="mt-6 border-t border-line pt-6">
        <p className="text-xs font-semibold text-ink-2">유효기간 연장</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => run("extend", "7d")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">+7일</button>
          <button onClick={() => run("extend", "30d")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">+30일</button>
          <button onClick={() => run("extend", "never")} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium">영구 보관</button>
        </div>
      </div>

      <button
        onClick={() => run("delete")}
        className="mt-6 w-full rounded-xl border border-toss-red py-3 font-semibold text-toss-red"
      >
        지금 삭제
      </button>

      {msg && <p className="mt-4 text-center text-sm text-ink-2">{msg}</p>}
    </main>
  );
}
