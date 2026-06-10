"use client";

import { type ReactNode } from "react";
import { ManageDrawerProvider, useManageDrawer } from "./manage-drawer-context";
import ManageDrawer from "./manage-drawer";
import useMediaQuery, { DESKTOP_MEDIA_QUERY } from "./use-media-query";

export default function DocsShell({ children }: { children: ReactNode }) {
  return (
    <ManageDrawerProvider>
      <DocsShellBody>{children}</DocsShellBody>
    </ManageDrawerProvider>
  );
}

function DocsShellBody({ children }: { children: ReactNode }) {
  const { openDoc } = useManageDrawer();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const shouldPush = openDoc !== null && isDesktop;

  return (
    <>
      <div
        className="transition-[padding] duration-300 ease-out"
        style={{ paddingRight: shouldPush ? "var(--drawer-width)" : "0px" }}
      >
        <main className="mx-auto max-w-2xl px-5 pt-10 pb-16">{children}</main>
      </div>
      <ManageDrawer />
    </>
  );
}
