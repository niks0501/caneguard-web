export const reportListItemDto = {
  uuid: "7e8c2e48-a2d4-4aca-9a50-9ca460fd7a7f",
  reference_code: "CG-2026-0001",
  reporter: {
    uuid: "1ca4cd6e-ab57-4744-a8be-47a91271fd02",
    name: "Ana Reporter",
  },
  barangay: "Mabini",
  submitted_at: "2026-07-20T10:00:00.000Z",
  predicted_label: "rust",
  confidence: 0.93,
  review_status: "submitted_unverified",
  image_url: "/storage/reports/example.jpg",
} as const;

export const reportDetailDto = {
  identity: {
    uuid: reportListItemDto.uuid,
    reference_code: reportListItemDto.reference_code,
    client_uuid: "cf9023da-e23c-43cb-a3ae-08ec6e0f302e",
  },
  reporter: {
    ...reportListItemDto.reporter,
    email: "ana@example.test",
  },
  barangay: reportListItemDto.barangay,
  timestamps: {
    captured_at: "2026-07-20T09:55:00.000Z",
    submitted_at: reportListItemDto.submitted_at,
  },
  image: {
    url: reportListItemDto.image_url,
    mime_type: "image/jpeg",
    size_bytes: 1024,
    source_type: "camera",
    source_width: 1600,
    source_height: 1200,
  },
  model: {
    predicted_label: reportListItemDto.predicted_label,
    confidence: reportListItemDto.confidence,
    class_scores: [
      { label: "rust", score: 0.93 },
      { label: "mosaic", score: 0.04 },
      { label: "healthy", score: 0.03 },
    ],
    model_version: "caneguard-v1",
    timings_ms: {
      preprocess: 10,
      inference: 20,
      total: 30,
    },
  },
  observations: {
    symptom_keys: ["orange_spots", "rough_leaf_surface"],
    checklist_consistency: "consistent",
    reported_severity: "moderate",
    quality_warnings: [],
  },
  review: {
    status: "submitted_unverified",
    notes: null,
    reviewer: null,
    reviewed_at: null,
  },
  updated_at: "2026-07-20T10:00:00.000Z",
} as const;

export const paginatedReportsDto = {
  data: [reportListItemDto],
  links: {
    first: "http://localhost:8000/api/v1/reports?page=1",
    last: "http://localhost:8000/api/v1/reports?page=1",
    prev: null,
    next: null,
  },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    per_page: 15,
    to: 1,
    total: 1,
  },
};
