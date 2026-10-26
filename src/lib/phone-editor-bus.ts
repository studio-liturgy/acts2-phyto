import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * The phone set editor's header buttons that act on things living inside the
 * editor body: Scripture Settings (the cog) and Undo.
 */
export const usePhoneEditorBus = create<{
  scriptureSettings: boolean;
  setScriptureSettings: (open: boolean) => void;
  /** The open editor's undo, registered by the editor itself. */
  undo: (() => void) | null;
  setUndo: (undo: (() => void) | null) => void;
}>((set) => ({
  scriptureSettings: false,
  setScriptureSettings: (open) => set({ scriptureSettings: open }),
  undo: null,
  setUndo: (undo) => set({ undo }),
}));

/** An editor offers its undo to the phone header's Undo button while mounted
 *  (and `active`). The newest editor to register wins. */
export function useRegisterPhoneUndo(undo: () => void, active = true): void {
  const latest = useRef(undo);
  latest.current = undo;
  useEffect(() => {
    if (!active) return;
    const fn = () => latest.current();
    usePhoneEditorBus.getState().setUndo(fn);
    return () => {
      if (usePhoneEditorBus.getState().undo === fn) usePhoneEditorBus.getState().setUndo(null);
    };
  }, [active]);
}
