import { Color } from "three";
import { describe, expect, it } from "vitest";

import { StlViewport } from "../../../src/components/viewer/core/StlViewport";

describe("StlViewport theme background", () => {
  it("uses a light scene background when switched to light mode", () => {
    const viewport = new StlViewport();

    viewport.setThemeMode("light");

    expect(((viewport as unknown as { scene: { background: Color } }).scene.background).getHex())
      .toBe(0xf3f6fb);
  });
});
