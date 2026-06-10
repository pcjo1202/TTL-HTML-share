"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface OpenDoc {
  id: string;
  name: string;
}

interface ManageDrawerValue {
  openDoc: OpenDoc | null;
  open: (doc: OpenDoc) => void;
  close: () => void;
}

const ManageDrawerContext = createContext<ManageDrawerValue | null>(null);

export function useManageDrawer(): ManageDrawerValue {
  const value = useContext(ManageDrawerContext);
  if (!value) {
    throw new Error("useManageDrawer는 ManageDrawerProvider 안에서만 사용할 수 있습니다.");
  }
  return value;
}

export function ManageDrawerProvider({ children }: { children: ReactNode }) {
  const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
  return (
    <ManageDrawerContext.Provider
      value={{ openDoc, open: setOpenDoc, close: () => setOpenDoc(null) }}
    >
      {children}
    </ManageDrawerContext.Provider>
  );
}
