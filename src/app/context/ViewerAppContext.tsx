import { createContext, useContext, type PropsWithChildren } from "react";

import {
  useViewerAppController,
  type ViewerAppController,
  type ViewerAppOptions,
} from "../hooks/useViewerAppController";

const ViewerAppContext = createContext<ViewerAppController | null>(null);

export function ViewerAppProvider(props: PropsWithChildren<ViewerAppOptions>) {
  const { children, ...options } = props;
  const controller = useViewerAppController(options);

  return (
    <ViewerAppContext.Provider value={controller}>
      {children}
    </ViewerAppContext.Provider>
  );
}

export function useViewerAppContext(): ViewerAppController {
  const context = useContext(ViewerAppContext);
  if (!context) {
    throw new Error("useViewerAppContext must be used within ViewerAppProvider");
  }

  return context;
}
