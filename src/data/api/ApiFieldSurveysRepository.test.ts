import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createAxiosClient } from "../../api/axiosClient";
import { server } from "../../test/server";
import { ApiFieldSurveysRepository } from "./ApiFieldSurveysRepository";

const baseUrl = "https://api.caneguard.test";
const boundariesDto = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "123",
    geometry: {
      type: "Polygon",
      coordinates: [[[122.95, 10.7], [122.951, 10.7], [122.951, 10.701], [122.95, 10.7]]],
    },
    properties: {
      id: 123,
      captured_at: "2026-10-04T02:30:12.123456Z",
      area_sqm: 6075.123,
      area_source: "device_reported",
      inspector: { uuid: "inspector-1", name: "Maria Santos" },
    },
  }],
  metadata: { total_count: 2, returned_count: 1, limit: 100, truncated: true },
};

describe("ApiFieldSurveysRepository", () => {
  it("requests the read contract, maps its properties, and preserves stored polygon rings", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/field-surveys`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("100");
        return HttpResponse.json(boundariesDto);
      }),
    );

    const repository = new ApiFieldSurveysRepository(createAxiosClient({ apiBaseUrl: baseUrl }));
    const result = await repository.listFieldSurveys();

    expect(result.features[0]).toMatchObject({
      id: "123",
      geometry: boundariesDto.features[0].geometry,
      properties: {
        id: 123,
        capturedAt: "2026-10-04T02:30:12.123456Z",
        areaSqm: 6075.123,
        areaSource: "device_reported",
        inspector: { uuid: "inspector-1", name: "Maria Santos" },
      },
    });
    expect(result.metadata).toEqual({ totalCount: 2, returnedCount: 1, limit: 100, truncated: true });
  });

  it("uses the requested limit and surfaces an unexpected response as a ZodError", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/field-surveys`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("25");
        return HttpResponse.json({ ...boundariesDto, features: "not-an-array" });
      }),
    );

    const repository = new ApiFieldSurveysRepository(createAxiosClient({ apiBaseUrl: baseUrl }));
    await expect(repository.listFieldSurveys(25)).rejects.toBeInstanceOf(ZodError);
  });
});
