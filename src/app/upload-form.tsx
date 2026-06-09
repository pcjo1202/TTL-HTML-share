"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";
import { htmlFileError, MAX_UPLOAD_BYTES } from "@/lib/upload-file";

const TTLS = [
  { v: "1d", label: "1일" },
  { v: "7d", label: "7일" },
  { v: "30d", label: "30일" },
  { v: "never", label: "영구" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export default function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("7d");
  const [isLocked, setIsLocked] = useState(false);
  const [viewPassword, setViewPassword] = useState("");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function pickFile(candidate: File | null) {
    if (!candidate) {
      setFile(null);
      return;
    }
    const error = htmlFileError(candidate, MAX_UPLOAD_BYTES);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(candidate);
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    if (!file || !name || !password) {
      toast.error("파일·이름·비밀번호를 입력하세요.");
      return;
    }
    if (isLocked && !viewPassword) {
      toast.error("열람 비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("password", password);
      fd.append("ttl", ttl);
      if (isLocked) {
        fd.append("lock", "on");
        fd.append("viewPassword", viewPassword);
      }
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

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files[0] ?? null);
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
          <a href={result.url} target="_blank" rel="noreferrer" className="rounded-lg bg-bg-2 px-3 py-2">↗ 새 탭에서 열기</a>
          <a href={`${result.url}/manage`} className="rounded-lg bg-bg-2 px-3 py-2">🔧 관리 페이지</a>
        </div>
        <p className="mt-4 rounded-lg bg-[#fff7d6] px-3 py-2 text-center text-xs text-[#7a5b00]">
          ⚠️ 관리 비밀번호를 따로 보관하세요. 분실 시 연장·삭제가 불가합니다.
        </p>
        <button onClick={() => { setResult(null); clearFile(); setName(""); setPassword(""); setIsLocked(false); setViewPassword(""); }} className="mt-4 w-full text-sm text-ink-3">또 올리기</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <input ref={fileInputRef} type="file" accept="text/html,.html" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />

      {file ? (
        <div className="flex min-h-[160px] flex-col justify-center gap-3 rounded-[20px] border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📄</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{file.name}</p>
              <p className="text-xs text-ink-3">{formatBytes(file.size)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-bg-2 px-3 py-1.5 text-sm font-medium text-ink-2">교체</button>
            <button onClick={clearFile} className="rounded-lg bg-bg-2 px-3 py-1.5 text-sm font-medium text-toss-red">제거</button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[160px] cursor-pointer items-center justify-center rounded-[20px] border-2 border-dashed text-center text-sm text-ink-3 ${
            isDragging ? "border-toss-blue bg-[#eef4ff]" : "border-line bg-white"
          }`}
        >
          <span>⬆️ HTML 파일을 끌어다 놓거나 클릭<br />(최대 10MB)</span>
        </label>
      )}

      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 2분기 대시보드)" className="rounded-xl border border-line bg-white px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리 비밀번호" className="rounded-xl border border-line bg-white px-4 py-3" />
        <div className="flex flex-wrap gap-2">
          {TTLS.map((t) => (
            <button key={t.v} onClick={() => setTtl(t.v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${ttl === t.v ? "bg-toss-blue text-white" : "bg-bg-2 text-ink-2"}`}>{t.label}</button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} />
          🔒 열람 잠금 (비밀번호 입력 후에만 열람)
        </label>
        {isLocked && (
          <input type="password" value={viewPassword} onChange={(e) => setViewPassword(e.target.value)} placeholder="열람 비밀번호 (관리 비밀번호와 별개)" className="rounded-xl border border-line bg-white px-4 py-3" />
        )}

        <button onClick={submit} disabled={busy} className="mt-2 rounded-xl bg-toss-blue py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "생성 중…" : "링크 생성하기"}
        </button>
      </div>
    </div>
  );
}
