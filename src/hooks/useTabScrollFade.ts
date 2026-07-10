import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Left/right fade indicators for an overflowing horizontal tab strip, plus
 * auto-scrolling the active tab into view when it changes.
 */
export function useTabScrollFade(
  terminalCount: number,
  sftpCount: number,
  terminalActiveId: string | null,
  sftpActiveId: string | null,
  activePanelType: "terminal" | "sftp",
) {
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [tabFade, setTabFade] = useState({ left: false, right: false });

  const updateTabFade = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    setTabFade({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateTabFade, { passive: true });
    updateTabFade();
    return () => el.removeEventListener("scroll", updateTabFade);
  }, [updateTabFade]);

  useEffect(() => {
    requestAnimationFrame(updateTabFade);
  }, [terminalCount, sftpCount, updateTabFade]);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      updateTabFade();
    });
  }, [terminalActiveId, sftpActiveId, activePanelType, updateTabFade]);

  return { tabBarRef, tabFade };
}
