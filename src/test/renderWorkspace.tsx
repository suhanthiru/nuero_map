import { Workspace } from "../features/workspace/Workspace";
import type { View } from "../features/workspace/model/tabs";
import { resetWorkspace } from "../features/workspace/workspaceStore";
import { renderWithProviders } from "./renderWithProviders";

/** The whole app frame (ribbon, sidebars, tabs) with one tab showing `view`. */
export function renderWorkspace(view: View = { kind: "today" }) {
  resetWorkspace(view);
  return renderWithProviders(<Workspace />);
}
