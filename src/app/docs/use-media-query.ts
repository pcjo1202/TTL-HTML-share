"use client";

import { useSyncExternalStore } from "react";

export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

export default function useMediaQuery(query: string): boolean {
  function subscribe(onChange: () => void): () => void {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }

  function getSnapshot(): boolean {
    return window.matchMedia(query).matches;
  }

  function getServerSnapshot(): boolean {
    return false;
  }

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
