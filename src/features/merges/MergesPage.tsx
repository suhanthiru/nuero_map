import { EmptyState, Page } from "../../shared/ui/Page";

/** Placeholder until merge suggestions land (Phase 8). */
export function MergesPage() {
  return (
    <Page eyebrow="Merges" title="Merge suggestions">
      <EmptyState title="Nothing to review yet">
        When two topics look like the same idea under different names, they'll show up here to merge.
      </EmptyState>
    </Page>
  );
}
