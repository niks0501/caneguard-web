import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { createAxiosClient } from "../../api/axiosClient";
import { server } from "../../test/server";
import { ApiFieldValidationRepository } from "./ApiFieldValidationRepository";

const baseUrl = "https://api.caneguard.test";
const mapDto = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "report-1",
      geometry: { type: "Point", coordinates: [122.9876543, 10.1234567] },
      properties: {
        uuid: "report-1",
        reference_code: "CG-2026-0001",
        barangay: "Mabini",
        province: "Negros Occidental",
        municipality: "Bago",
        observed_at: "2026-08-13T10:20:30.000Z",
        submitted_at: "2026-08-13T11:00:00.000Z",
        predicted_label: "rust",
        confidence: 0.84,
        review_status: "for_field_validation",
        location_source: "gps",
        gps_accuracy: 8.5,
        affected_area_hectares: 2.5,
        affected_portion_percent: 18,
      },
    },
  ],
  metadata: {
    total_count: 2,
    located_count: 1,
    unlocated_count: 1,
    limit: 1000,
    returned_count: 1,
    truncated: false,
  },
} as const;

const queueDto = {
  data: {
    queue: "follow_up_due",
    count: 1,
    oldest: {
      uuid: "report-1",
      reference_code: "CG-2026-0001",
      barangay: "Mabini",
      province: "Negros Occidental",
      municipality: "Bago",
      observed_at: "2026-08-13T10:20:30.000Z",
      submitted_at: "2026-08-13T11:00:00.000Z",
      predicted_label: "rust",
      confidence: 0.84,
      review_status: "for_field_validation",
      target_visit_date: "2026-08-12",
      final_latitude: 10.1234567,
      final_longitude: 122.9876543,
      location_source: "gps",
      gps_accuracy: 8.5,
      affected_area_hectares: 2.5,
      affected_portion_percent: 18,
    },
    items: [],
  },
} as const;

describe("ApiFieldValidationRepository", () => {
  it("serializes map filters and maps longitude-first GeoJSON", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports/map`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("status")).toBe("resolved");
        expect(query.get("predicted_label")).toBe("rust");
        expect(query.get("barangay")).toBe("Mabini");
        expect(query.get("date_from")).toBe("2026-08-01");
        return HttpResponse.json(mapDto);
      }),
    );

    const repository = new ApiFieldValidationRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );
    const result = await repository.getMap({
      status: "resolved",
      disease: "rust",
      barangay: " Mabini ",
      dateFrom: "2026-08-01",
    });

    expect(result.features[0].geometry.coordinates).toEqual([
      122.9876543,
      10.1234567,
    ]);
    expect(result.features[0].properties.predictedDisease).toBe("rust");
    expect(result.metadata.unlocatedCount).toBe(1);
  });

  it("does not send the map-only review state to the fixed queue", async () => {
    server.use(
      http.get(`${baseUrl}/api/v1/reports/field-validation-queue`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        expect(query.get("status")).toBeNull();
        expect(query.get("queue")).toBe("follow_up_due");
        expect(query.get("predicted_label")).toBe("rust");
        expect(query.get("limit")).toBe("50");
        return HttpResponse.json(queueDto);
      }),
    );

    const repository = new ApiFieldValidationRepository(
      createAxiosClient({ apiBaseUrl: baseUrl }),
    );
    const result = await repository.getQueue({
      queue: "follow_up_due",
      status: "verified_by_staff",
      disease: "rust",
    });

    expect(result.queue).toBe("follow_up_due");
    expect(result.count).toBe(1);
    expect(result.oldest?.referenceCode).toBe("CG-2026-0001");
    expect(result.oldest?.targetVisitDate).toBe("2026-08-12");
  });
});
