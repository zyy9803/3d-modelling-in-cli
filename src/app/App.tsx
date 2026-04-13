import { useMemo } from "react";

import { MockSessionClient, resolveMockCodexScenarioId } from "../components/chat";
import { ViewerApp } from "./ViewerApp";
import { AppProviders } from "./providers/AppProviders";

export function App() {
  const mockScenarioId =
    typeof window === "undefined"
      ? null
      : resolveMockCodexScenarioId(window.location.search);

  const sessionClient = useMemo(
    () => (mockScenarioId ? new MockSessionClient(mockScenarioId) : undefined),
    [mockScenarioId],
  );

  return (
    <AppProviders>
      <ViewerApp sessionClient={sessionClient} />
    </AppProviders>
  );
}
