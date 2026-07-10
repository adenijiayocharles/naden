import { useCallback, useState } from "react";

export type TabKind = "terminal" | "sftp";

interface DragState {
  id: string;
  type: TabKind;
}

function reorderById<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((s) => s.id === fromId);
  const to = list.findIndex((s) => s.id === toId);
  if (from === -1 || to === -1) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, list[from]);
  return next;
}

/**
 * Drag-to-reorder for the unified terminal/SFTP tab strip. Both tab kinds
 * share one drag state so dragging a terminal tab over an SFTP tab (or vice
 * versa) is a no-op rather than a cross-list reorder.
 */
export function useTabDragReorder<TTerminal extends { id: string }, TSftp extends { id: string }>(
  terminalSessions: TTerminal[],
  sftpSessions: TSftp[],
  onReorderTerminal: (sessions: TTerminal[]) => void,
  onReorderSftp: (sessions: TSftp[]) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const resetDrag = useCallback(() => {
    setDrag(null);
    setDragOverId(null);
  }, []);

  const handleDragStart = useCallback((id: string, type: TabKind, e: React.DragEvent) => {
    setDrag({ id, type });
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback(
    (id: string, type: TabKind, e: React.DragEvent) => {
      if (drag?.type !== type) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(id);
    },
    [drag?.type],
  );

  const handleDrop = useCallback(
    (targetId: string, type: TabKind, e: React.DragEvent) => {
      e.preventDefault();
      if (!drag || drag.type !== type || drag.id === targetId) {
        resetDrag();
        return;
      }
      if (type === "terminal") {
        onReorderTerminal(reorderById(terminalSessions, drag.id, targetId));
      } else {
        onReorderSftp(reorderById(sftpSessions, drag.id, targetId));
      }
      resetDrag();
    },
    [drag, terminalSessions, sftpSessions, onReorderTerminal, onReorderSftp, resetDrag],
  );

  return { drag, dragOverId, resetDrag, handleDragStart, handleDragOver, handleDrop };
}
