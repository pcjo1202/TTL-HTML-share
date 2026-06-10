"use client";

import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import ManagePanel from "./manage-panel";
import { useManageDrawer } from "./manage-drawer-context";
import useMediaQuery, { DESKTOP_MEDIA_QUERY } from "./use-media-query";

export default function ManageDrawer() {
  const { openDoc, close } = useManageDrawer();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const router = useRouter();
  const isOpen = openDoc !== null;

  const panel = openDoc ? (
    <ManagePanel
      id={openDoc.id}
      name={openDoc.name}
      onActionComplete={() => {
        close();
        router.refresh();
      }}
    />
  ) : null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal>
        {isDesktop ? (
          <>
            <Dialog.Overlay className="fixed inset-0 z-30" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-40 w-[var(--drawer-width)] overflow-y-auto bg-white p-6 shadow-card focus:outline-none data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out">
              <Dialog.Title className="sr-only">{openDoc?.name} 관리</Dialog.Title>
              {panel}
            </Dialog.Content>
          </>
        ) : (
          <>
            <Dialog.Overlay className="fixed inset-0 z-30 bg-black/35 data-[state=open]:animate-fade" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl bg-white p-5 pb-8 shadow-card focus:outline-none data-[state=open]:animate-sheet">
              <Dialog.Title className="sr-only">{openDoc?.name} 관리</Dialog.Title>
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
              {panel}
            </Dialog.Content>
          </>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
