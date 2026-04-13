import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function resolveFromRepo(...segments: string[]): string {
  return resolve(process.cwd(), ...segments);
}

function collectSourceFiles(rootPath: string): string[] {
  const entries = readdirSync(rootPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = resolve(rootPath, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx|scss)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("frontend structure refactor", () => {
  it("moves frontend domains and the global stylesheet to their target locations", () => {
    expect(existsSync(resolveFromRepo("src", "components", "chat", "index.ts"))).toBe(true);
    expect(existsSync(resolveFromRepo("src", "components", "viewer", "index.ts"))).toBe(true);
    expect(
      existsSync(resolveFromRepo("src", "components", "viewer", "core", "index.ts")),
    ).toBe(true);
    expect(existsSync(resolveFromRepo("src", "app", "global.scss"))).toBe(true);
    expect(existsSync(resolveFromRepo("src", "features"))).toBe(false);
    expect(existsSync(resolveFromRepo("src", "lib"))).toBe(false);
    expect(existsSync(resolveFromRepo("src", "styles"))).toBe(false);
  });

  it("removes old frontend import paths from source and frontend tests", () => {
    const files = [
      ...collectSourceFiles(resolveFromRepo("src")),
      ...collectSourceFiles(resolveFromRepo("tests", "frontend")),
    ];

    for (const file of files) {
      if (file.endsWith("frontend-structure-refactor.test.ts")) {
        continue;
      }

      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("features/chat");
      expect(content).not.toContain("features/viewer");
      expect(content).not.toContain("lib/viewer");
      expect(content).not.toContain("styles/index.scss");
    }
  });
});
