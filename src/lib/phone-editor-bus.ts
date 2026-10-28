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
  /** Whether that editor has anything to undo (the button shows only then). */
  canUndo: boolean;
  setCanUndo: (canUndo: boolean) => void;
}>((set) => ({
  scriptureSettings: false,
  setScriptureSettings: (open) => set({ scriptureSettings: open }),
  undo: null,
  setUndo: (undo) => set({ undo }),
  canUndo: false,
  setCanUndo: (canUndo) => set({ canUndo }),
}));

/** An editor offers its undo to the phone header's Undo button while mounted
 *  (and `active`), with whether it has a step to undo. The newest editor to
 *  register wins. */
export function useRegisterPhoneUndo(undo: () => void, active: boolean, canUndo: boolean): void {
  const latest = useRef(undo);
  latest.current = undo;
  const fnRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    const fn = () => latest.current();
    fnRef.current = fn;
    usePhoneEditorBus.getState().setUndo(fn);
    return () => {
      fnRef.current = null;
      if (usePhoneEditorBus.getState().undo === fn) {
        usePhoneEditorBus.getState().setUndo(null);
        usePhoneEditorBus.getState().setCanUndo(false);
      }
    };
  }, [active]);
  useEffect(() => {
    const bus = usePhoneEditorBus.getState();
    if (active && fnRef.current && bus.undo === fnRef.current) bus.setCanUndo(canUndo);
  }, [active, canUndo]);
}
