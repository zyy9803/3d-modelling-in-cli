import { describe, expect, it } from "vitest";

import { createAppTheme } from "../../../src/app/providers/theme";

describe("app theme", () => {
  it("uses a muted slate divider in dark mode instead of a bright gray border", () => {
    const theme = createAppTheme("dark");

    expect(theme.palette.divider).toBe("rgba(51, 65, 85, 0.46)");
    expect(theme.palette.background.paper).toBe("#182230");
  });

  it("allows tooltip content to wrap so long error messages stay fully visible", () => {
    const theme = createAppTheme("dark");
    const tooltipStyles = theme.components?.MuiTooltip?.styleOverrides?.tooltip as
      | Record<string, unknown>
      | undefined;

    expect(tooltipStyles?.maxWidth).toBe(720);
    expect(tooltipStyles?.whiteSpace).toBe("pre-wrap");
    expect(tooltipStyles?.overflowWrap).toBe("anywhere");
    expect(tooltipStyles?.lineHeight).toBe(1.5);
  });
});
