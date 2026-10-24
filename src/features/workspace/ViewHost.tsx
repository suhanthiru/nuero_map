import { Button } from "../../shared/ui/Button";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { EmptyState } from "../../shared/ui/Page";
import { HomePage } from "../home/HomePage";
import { GraphPage } from "../graph/GraphPage";
import { ImportPage } from "../import/ImportPage";
import { MergesPage } from "../merges/MergesPage";
import { ReviewPage } from "../review/ReviewPage";
import { SettingsPage } from "../settings/SettingsPage";
import { TopicPage } from "../topic/TopicPage";
import { NotePage } from "../vault/NotePage";
import type { Pane } from "./model/panes";
import { currentView, viewKey, type View } from "./model/tabs";
import { TabContext } from "./useOpen";
import s from "./Workspace.module.css";

function ViewContent({ view }: { readonly view: View }) {
  switch (view.kind) {
    case "today":
      return <HomePage />;
    case "graph":
      return <GraphPage focusTopicId={view.focusTopicId} edgeId={view.edgeId} />;
    case "topic":
      return <TopicPage key={view.topicId} topicId={view.topicId} />;
    case "note":
      return <NotePage key={view.noteId} noteId={view.noteId} />;
    case "import":
      return <ImportPage />;
    case "settings":
      return <SettingsPage />;
    case "merges":
      return <MergesPage />;
    case "review":
      return <ReviewPage />;
  }
}

/** Shown in place of a view that failed to render; the rest of the window keeps working. */
function ViewCrashed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <EmptyState title="This view hit a problem">
      Your notes and data are safe. <Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button>
    </EmptyState>
  );
}

interface Props {
  readonly pane: Pane;
  /** This pane has focus: its visible tab is the one that answers global keys. */
  readonly focused: boolean;
}

/**
 * Every tab stays mounted (hidden when inactive), so the graph keeps its layout and
 * pages keep their scroll position when you switch back, like editor tabs.
 */
export function ViewHost({ pane, focused }: Props) {
  return (
    <div className={s.viewHost}>
      {pane.ws.tabs.map((tab) => {
        const active = tab.id === pane.ws.activeId;
        const view = currentView(tab);
        return (
          <section
            key={tab.id}
            id={`panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            className={s.viewPanel}
            hidden={!active}
            tabIndex={-1}
          >
            <TabContext.Provider value={{ tabId: tab.id, paneId: pane.id, active, focused: active && focused }}>
              <ErrorBoundary key={viewKey(view)} fallback={(_error, reset) => <ViewCrashed onRetry={reset} />}>
                <ViewContent view={view} />
              </ErrorBoundary>
            </TabContext.Provider>
          </section>
        );
      })}
    </div>
  );
}
