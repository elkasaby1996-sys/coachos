import { describe, expect, it } from "vitest";
import {
  dropdownMenuContentVariants,
  dropdownMenuItemVariants,
  selectVariants,
} from "../../src/lib/dropdown-system";

describe("dropdown system variants", () => {
  it("uses the shared menu surface classes for standard dropdown menus", () => {
    expect(dropdownMenuContentVariants()).toContain("app-dropdown-content");
    expect(dropdownMenuContentVariants()).toContain("rounded-[24px]");
    expect(dropdownMenuContentVariants()).toContain("p-2");
  });

  it("supports compact and panel content variants", () => {
    expect(
      dropdownMenuContentVariants({ variant: "panel", size: "compact" }),
    ).toContain("p-0");
    expect(
      dropdownMenuContentVariants({ variant: "panel", size: "compact" }),
    ).toContain("rounded-[22px]");
  });

  it("applies consistent item density variants", () => {
    expect(dropdownMenuItemVariants()).toContain("min-h-[2.75rem]");
    expect(dropdownMenuItemVariants({ size: "compact" })).toContain(
      "min-h-[2.5rem]",
    );
  });

  it("maps shared select variants to the dropdown language classes", () => {
    expect(selectVariants()).toContain("app-select");
    expect(selectVariants()).toContain("app-select-field");
    expect(selectVariants({ variant: "filter", size: "sm" })).toContain(
      "app-select-filter",
    );
    expect(selectVariants({ variant: "filter", size: "sm" })).toContain(
      "app-select-sm",
    );
  });
});
