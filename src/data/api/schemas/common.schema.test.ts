import { describe, expect, it } from "vitest";
import { paginationMetaSchema, userSchema } from "./common.schema";

describe("common API schemas", () => {
  it("validates users and pagination", () => {
    expect(
      userSchema.parse({
        uuid: "1ca4cd6e-ab57-4744-a8be-47a91271fd02",
        name: "Ana Reporter",
        email: "ana@example.test",
      }).name,
    ).toBe("Ana Reporter");
    expect(
      paginationMetaSchema.parse({
        current_page: 2,
        from: 16,
        last_page: 3,
        per_page: 15,
        to: 30,
        total: 31,
      }).last_page,
    ).toBe(3);
  });

  it("rejects malformed user email addresses", () => {
    expect(() =>
      userSchema.parse({
        uuid: "user-1",
        name: "Ana Reporter",
        email: "not-an-email",
      }),
    ).toThrow();
  });
});
