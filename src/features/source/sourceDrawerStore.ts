import { create } from "zustand";
import type { MessageId } from "../../api/contract";

interface SourceDrawerState {
  readonly messageId: MessageId | null;
  open: (messageId: MessageId) => void;
  close: () => void;
}

export const useSourceDrawer = create<SourceDrawerState>((set) => ({
  messageId: null,
  open: (messageId) => set({ messageId }),
  close: () => set({ messageId: null }),
}));
