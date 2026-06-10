"use client";

import { useManageDrawer } from "./manage-drawer-context";

interface ManageButtonProps {
  id: string;
  name: string;
}

export default function ManageButton({ id, name }: ManageButtonProps) {
  const { open } = useManageDrawer();
  return (
    <button
      onClick={() => open({ id, name })}
      aria-label={`${name} 관리`}
      className="shrink-0 rounded-lg bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-line"
    >
      관리
    </button>
  );
}
