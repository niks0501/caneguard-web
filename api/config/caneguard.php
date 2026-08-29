<?php

return [
    'legacy_public_storage_link' => public_path('storage'),
    'demo_users' => [
        'field_reporter_password' => env('CANEGUARD_FIELD_PASSWORD'),
        'reviewer_password' => env('CANEGUARD_REVIEWER_PASSWORD'),
        'admin_password' => env('CANEGUARD_ADMIN_PASSWORD'),
    ],
    'duplicate_assistance' => [
        'recent_window_hours' => 72,
        'location_radius_meters' => 100,
        'max_matches' => 5,
        'max_candidates' => 200,
    ],
];
