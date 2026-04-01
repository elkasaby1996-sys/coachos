import { createContext, useContext } from "react";

export type PtMessageComposeOptions = {
  clientId?: string | null;
  draft?: string;
};

export type PtMessageComposeContextValue = {
  openComposer: (options?: PtMessageComposeOptions) => void;
  closeComposer: () => void;
};

export const PtMessageComposeContext =
  createContext<PtMessageComposeContextValue | null>(null);

export function usePtMessageCompose() {
  const context = useContext(PtMessageComposeContext);
  if (!context) {
    throw new Error(
      "usePtMessageCompose must be used within PtMessageComposeProvider.",
    );
  }
  return context;
}
