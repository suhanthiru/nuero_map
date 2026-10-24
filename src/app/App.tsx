import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Workspace } from "../features/workspace/Workspace";
import { ThemeProvider } from "./providers/ThemeProvider";

const STALE_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: STALE_MS, retry: 1, refetchOnWindowFocus: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Workspace />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
