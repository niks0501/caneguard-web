export const reportListItemDto = {
  uuid: "7e8c2e48-a2d4-4aca-9a50-9ca460fd7a7f",
  reference_code: "CG-2026-0001",
  reporter: {
    uuid: "1ca4cd6e-ab57-4744-a8be-47a91271fd02",
    name: "Ana Reporter",
  },
  barangay: "Mabini",
  province: "Negros Occidental",
  municipality: "Bago",
  observed_at: "2026-07-20T09:58:00.000Z",
  captured_at: "2026-07-20T09:55:00.000Z",
  submitted_at: "2026-07-20T10:00:00.000Z",
  predicted_label: "rust",
  confidence: 0.93,
  review_status: "submitted_unverified",
  lifecycle: {
    case_state: "open",
    verification_outcome: "not_determined",
    field_validation_state: "unassigned",
    referral_state: "not_referred",
  },
  mismatch_reported: true,
  image_url:
    "https://api.caneguard.test/api/v1/reports/7e8c2e48-a2d4-4aca-9a50-9ca460fd7a7f/image",
} as const;

export const reportDetailDto = {
  identity: {
    uuid: reportListItemDto.uuid,
    reference_code: reportListItemDto.reference_code,
    client_uuid: "cf9023da-e23c-43cb-a3ae-08ec6e0f302e",
    scan_record_client_uuid: "a9b3c7d1-e23c-43cb-a3ae-08ec6e0f302e",
  },
  reporter: {
    ...reportListItemDto.reporter,
    email: "ana@example.test",
  },
  barangay: reportListItemDto.barangay,
  timestamps: {
    captured_at: reportListItemDto.captured_at,
    observed_at: reportListItemDto.observed_at,
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
    farmer_or_farm_owner_name: "Juan Dela Cruz",
    province: "Negros Occidental",
    municipality: "Bago",
    final_latitude: 10.1234567,
    final_longitude: 122.9876543,
    location_source: "gps",
    gps_accuracy: 4.25,
    checklist_consistency: "consistent",
    reported_severity: "moderate",
    quality_warnings: [],
    sugarcane_variety: "PSR 86",
    crop_age: "6 months",
    cane_class: "Class A",
    affected_area_hectares: 12.5,
    affected_portion_percent: 42.75,
    field_notes: "Rust symptoms concentrated on the eastern edge.",
  },
  reporter_observation: {
    mismatch_reported: true,
    reporter_suspected_condition: "smut",
    reporter_observation_text:
      "Dark whip-like growths are visible at the tops of several stalks.",
  },
  review: {
    status: "submitted_unverified",
    notes: null,
    authority_classified_condition: null,
    action_taken: null,
    reviewer: null,
    reviewed_at: null,
  },
  audit: {
    metadata_corrections: [],
  },
  lifecycle: {
    case_state: "open",
    verification_outcome: "not_determined",
    field_validation_state: "unassigned",
    referral_state: "not_referred",
  },
  version: 0,
  updated_at: "2026-07-20T10:00:00.000Z",
} as const;

export const reportReferralDto = {
  destination: "Regional crop protection office",
  reference: "SRA-2026-0042",
  referral_date: "2026-09-04",
  note: "Please review the mismatch.",
  response_date: null,
  response_note: null,
  response_finding: null,
  referred_by: {
    uuid: "a7c6e31a-e1d6-443f-a2f2-cf73541e7a0f",
    name: "Maria Reviewer",
  },
  response_recorded_by: null,
  response_recorded_at: null,
  office_context: {
    case_state: "open",
    verification_outcome: "not_determined",
    field_validation_state: "unassigned",
    action_taken: "referred_for_expert_validation",
    authority_classified_condition: null,
    notes: "The office is awaiting expert input.",
    reviewer: {
      uuid: "a7c6e31a-e1d6-443f-a2f2-cf73541e7a0f",
      name: "Maria Reviewer",
    },
    reviewed_at: "2026-09-04T10:00:00.000Z",
  },
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
