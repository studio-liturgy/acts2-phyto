import { create } from "zustand";

/**
 * The phone set editor's header buttons that open things living inside the
 * editor body: Scripture Settings (the cog beside Share).
 */
export const usePhoneEditorBus = create<{
  scriptureSettings: boolean;
  setScriptureSettings: (open: boolean) => void;
}>((set) => ({
  scriptureSettings: false,
  setScriptureSettings: (open) => set({ scriptureSettings: open }),
}));
