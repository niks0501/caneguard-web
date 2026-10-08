import { describe, expect, it, vi } from "vitest";
import { registerMissingMapImage } from "./registerMissingMapImage";

describe("registerMissingMapImage", () => {
  it("registers a fallback for a missing style image", () => {
    const map = {
      hasImage: vi.fn(() => false),
      addImage: vi.fn(),
    };

    registerMissingMapImage(map, "missing-marker");

    expect(map.addImage).toHaveBeenCalledWith("missing-marker", expect.anything());
  });

  it("does not replace a valid image already supplied by the style", () => {
    const map = {
      hasImage: vi.fn(() => true),
      addImage: vi.fn(),
    };

    registerMissingMapImage(map, "resolved-marker");

    expect(map.addImage).not.toHaveBeenCalled();
  });
});
