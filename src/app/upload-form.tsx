"use client";

import { useState } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";

const TTLS = [
  { v: "1d", label: "1일" },
  { v: "7d", label: "7일" },
  { v: "30d", label: "30일" },
  { v: "never", label: "영구" },
] as const;

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("7d");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file || !name || !password) {
      toast.error("파일·이름·비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("password", password);
      fd.append("ttl", ttl);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }));
        return;
      }
      setResult({ url: json.url });
    } catch {
      toast.error(clientErrorMessage({ networkError: true }));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("링크를 복사했습니다");
  }

  if (result) {
    return (
      <div className="rounded-[20px] bg-white p-6 shadow-sm">
        <p className="text-center text-lg font-bold">✓ 링크가 생성되었습니다</p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={result.url} className="flex-1 rounded-xl border border-line bg-bg-2 px-3 py-2 font-mono text-sm" />
          <button onClick={() => copyLink(result.url)} className="rounded-xl bg-toss-blue px-4 font-semibold text-white">복사</button>
        </div>
        <div className="mt-3 flex justify-center gap-2 text-sm">
          <a href={result.url} target="_blank" className="rounded-lg bg-bg-2 px-3 py-2">↗ 새 탭에서 열기</a>
          <a href={`${result.url}/manage`} className="rounded-lg bg-bg-2 px-3 py-2">🔧 관리 페이지</a>
        </div>
        <p className="mt-4 rounded-lg bg-[#fff7d6] px-3 py-2 text-center text-xs text-[#7a5b00]">
          ⚠️ 관리 비밀번호를 따로 보관하세요. 분실 시 연장·삭제가 불가합니다.
        </p>
        <button onClick={() => { setResult(null); setFile(null); setName(""); setPassword(""); }} className="mt-4 w-full text-sm text-ink-3">또 올리기</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed border-line bg-white text-center text-sm text-ink-3">
        <input type="file" accept="text/html,.html" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="font-medium text-ink">{file.name}</span> : <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>}
      </label>

      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 2분기 대시보드)" className="rounded-xl border border-line bg-white px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리 비밀번호" className="rounded-xl border border-line bg-white px-4 py-3" />
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button key={t.v} onClick={() => setTtl(t.v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}>{t.label}</button>
          ))}
        </div>
        <button onClick={submit} disabled={busy} className="mt-2 rounded-xl bg-toss-blue py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "생성 중…" : "링크 생성하기"}
        </button>
      </div>
    </div>
  );
}
