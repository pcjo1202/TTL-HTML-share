"use client";

import { useState } from "react";
import { toast } from "sonner";
import { clientErrorMessage } from "@/lib/error-message";

interface ManagePanelProps {
  id: string;
  name?: string;
  onActionComplete?: (action: "extend" | "delete") => void;
}

export default function ManagePanel({ id, name, onActionComplete }: ManagePanelProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: "extend" | "delete", ttl?: string) {
    if (!password) {
      toast.error("관리 비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/manage/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action, ttl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(clientErrorMessage({ status: res.status, serverMessage: json?.error }));
        return;
      }
      toast.success(action === "delete" ? "삭제되었습니다" : "유효기간이 연장되었습니다");
      onActionComplete?.(action);
    } catch {
      toast.error(clientErrorMessage({ networkError: true }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-base font-bold text-ink">{name ?? "문서 관리"}</h2>

      <label className="mt-4 block text-xs font-semibold text-ink-2">관리 비밀번호</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="업로드 때 정한 비밀번호"
        autoFocus
        className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3"
      />

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-semibold text-ink-2">유효기간 연장</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => run("extend", "7d")} disabled={busy} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium disabled:opacity-50">+7일</button>
          <button onClick={() => run("extend", "30d")} disabled={busy} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium disabled:opacity-50">+30일</button>
          <button onClick={() => run("extend", "never")} disabled={busy} className="rounded-lg bg-bg-2 px-4 py-2 text-sm font-medium disabled:opacity-50">영구 보관</button>
        </div>
      </div>

      <button
        onClick={() => run("delete")}
        disabled={busy}
        className="mt-5 w-full rounded-xl border border-toss-red py-3 font-semibold text-toss-red disabled:opacity-50"
      >
        지금 삭제
      </button>
    </div>
  );
}
