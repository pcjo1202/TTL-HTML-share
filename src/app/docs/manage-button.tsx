"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import ManagePanel from "./manage-panel";
import useMediaQuery from "./use-media-query";

interface ManageButtonProps {
  id: string;
  name: string;
}

const TRIGGER_CLASS =
  "shrink-0 rounded-lg bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-line";
const PANEL_CLASS = "bg-white p-5 shadow-card focus:outline-none";

export default function ManageButton({ id, name }: ManageButtonProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const panel = (
    <ManagePanel
      id={id}
      name={name}
      onActionComplete={() => {
        setOpen(false);
        router.refresh();
      }}
    />
  );

  if (isDesktop) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className={TRIGGER_CLASS}>관리</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="left"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className={`z-30 w-[280px] rounded-2xl data-[state=open]:animate-pop ${PANEL_CLASS}`}
          >
            {panel}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={TRIGGER_CLASS}>관리</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/35 data-[state=open]:animate-fade" />
        <Dialog.Content
          className={`fixed inset-x-0 bottom-0 z-40 rounded-t-3xl pb-8 data-[state=open]:animate-sheet ${PANEL_CLASS}`}
        >
          <Dialog.Title className="sr-only">{name} 관리</Dialog.Title>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
          {panel}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
