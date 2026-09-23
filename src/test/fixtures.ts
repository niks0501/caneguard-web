export const reportListItemDto = {
  uuid: "7e8c2e48-a2d4-4aca-9a50-9ca460fd7a7f",
  reference_code: "CG-2026-0001",
  reporter: {
    uuid: "1ca4cd6e-ab57-4744-a8be-47a91271fd02",
    name: "Ana Reporter",
  },
  barangay: "Balaytigui",
  province: "Batangas",
  municipality: "Nasugbu",
  observed_at: "2026-07-20T09:58:00.000Z",
  captured_at: "2026-07-20T09:55:00.000Z",
  submitted_at: "2026-07-20T10:00:00.000Z",
  predicted_label: "rust",
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
    confidence: 0.93,
    class_scores: [
      { label: "rust", score: 0.93 },
      { label: "mosaic", score: 0.04 },
      { label: "healthy", score: 0.03 },
      { label: "smut", score: 0 },
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
    province: "Batangas",
    municipality: "Nasugbu",
    final_latitude: 14.126,
    final_longitude: 120.6039,
    location_source: "gps",
    gps_accuracy: 4.25,
    checklist_consistency: "consistent",
    reported_severity: "moderate",
    quality_warnings: [],
    sugarcane_variety: "PSR 86",
    crop_age: "6 months",
    cane_class: "Class A",
    affected_area_hectares: 12.5,
    affected_area_measurement: "measured",
    affected_portion_percent: 42.75,
    affected_portion_measurement: "measured",
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

export const staffClassifiedReportDetailDto = {
  ...reportDetailDto,
  review: {
    ...reportDetailDto.review,
    authority_classified_condition: "rssi",
  },
} as const;

export const completedFieldValidationAssignmentDto = {
  uuid: "3fbd7f77-7d6b-4eb0-a1c7-b673f5a2f39f",
  assignee: {
    uuid: reportDetailDto.reporter.uuid,
    name: reportDetailDto.reporter.name,
  },
  assigned_by: {
    uuid: "a7c6e31a-e1d6-443f-a2f2-cf73541e7a0f",
    name: "Maria Reviewer",
  },
  target_visit_date: "2026-08-13",
  activated_at: "2026-08-13T12:00:00.000Z",
  updated_at: "2026-08-14T12:00:00.000Z",
  completion: {
    uuid: "f4c6d8e0-2a4b-4c6d-8e0f-2a4b6c8d0e1f",
    client_uuid: "e1f2a3b4-c5d6-47e8-9f0a-1b2c3d4e5f60",
    assignment_uuid: "3fbd7f77-7d6b-4eb0-a1c7-b673f5a2f39f",
    field_observation: "Fresh observation from the assigned validation visit.",
    field_finding: "The field finding is preserved as separate evidence.",
    action_taken: "Provided field guidance and recorded the next action.",
    follow_up_outcome: "improved",
    visited_at: "2026-08-14T09:30:00.000Z",
    gps: {
      outcome: "resolved",
      attempted_at: "2026-08-14T09:29:55.000Z",
      latitude: 14.0667,
      longitude: 120.6319,
      accuracy: 4.25,
    },
    fresh_photo: {
      available: false,
      mime_type: null,
      size_bytes: null,
    },
    created_at: "2026-08-14T09:30:00.000Z",
    updated_at: "2026-08-14T09:30:00.000Z",
  },
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
