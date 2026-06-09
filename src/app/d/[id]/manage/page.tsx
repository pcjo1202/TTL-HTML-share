"use client";

import { use } from "react";
import ManagePanel from "@/app/docs/manage-panel";

export default function ManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <ManagePanel id={id} />
      <p className="mt-4 text-center text-xs text-ink-3">/d/{id}</p>
    </main>
  );
}
