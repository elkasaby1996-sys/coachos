import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
} from "react";

export const WorkspaceHeaderModeContext = createContext<"default" | "shell">(
  "default",
);

export function useWorkspaceHeaderMode() {
  return useContext(WorkspaceHeaderModeContext);
}

export function WorkspaceHeaderModeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: "default" | "shell";
}) {
  return createElement(
    WorkspaceHeaderModeContext.Provider,
    { value },
    children,
  );
}
