import { describe, expect, it, vi } from "vitest";
import { registerMissingMapImage } from "./registerMissingMapImage";

describe("registerMissingMapImage", () => {
  it("registers a fallback image for an unresolved style sprite id", () => {
    const map = {
      hasImage: vi.fn(() => false),
      addImage: vi.fn(),
    };

    registerMissingMapImage(map, "missing-marker");

    expect(map.addImage).toHaveBeenCalledWith("missing-marker", {
      width: 1,
      height: 1,
      data: new Uint8Array([45, 107, 64, 255]),
    });
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
