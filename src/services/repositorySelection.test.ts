import { describe, expect, it } from "vitest";
import { ApiDashboardRepository } from "../data/api/ApiDashboardRepository";
import { ApiReportsRepository } from "../data/api/ApiReportsRepository";
import { MockDashboardRepository } from "../data/mock/MockDashboardRepository";
import { MockReportsRepository } from "../data/mock/MockReportsRepository";
import { createDashboardRepository } from "./dashboard.service";
import { createReportsRepository } from "./reports.service";

describe("repository selection", () => {
  it("uses API repositories by default", () => {
    expect(createReportsRepository()).toBeInstanceOf(ApiReportsRepository);
    expect(createDashboardRepository()).toBeInstanceOf(ApiDashboardRepository);
  });

  it("keeps mock mode as an explicit fallback", () => {
    expect(createReportsRepository("mock")).toBeInstanceOf(MockReportsRepository);
    expect(createDashboardRepository("mock")).toBeInstanceOf(
      MockDashboardRepository,
    );
  });
});
