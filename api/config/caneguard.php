<?php

return [
    'legacy_public_storage_link' => public_path('storage'),
    'auth' => [
        'verification_url' => env(
            'CANEGUARD_VERIFICATION_URL',
            rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/verify-email',
        ),
        'password_reset_url' => env(
            'CANEGUARD_PASSWORD_RESET_URL',
            rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/reset-password',
        ),
        'password_min_length' => max(15, (int) env('CANEGUARD_PASSWORD_MIN_LENGTH', 15)),
        'password_max_length' => max(64, (int) env('CANEGUARD_PASSWORD_MAX_LENGTH', 128)),
        'compromised_password_hashes' => array_values(
            array_unique(
                array_filter(
                    array_map(
                        'trim',
                        array_merge(
                            [
                                'abf7aad6438836dbe526aa231abde2d0eef74d42',
                                '7e13c003a8256cd421055563c5da6571d50713c9',
                                '65cc4c0b6cf9c56e2a2d801df1b99dc933db9991',
                            ],
                            explode(',', (string) env('CANEGUARD_COMPROMISED_PASSWORD_HASHES', '')),
                        ),
                    ),
                ),
            ),
        ),
    ],
    'security_audit' => [
        'retention_days' => (int) env('CANEGUARD_SECURITY_AUDIT_RETENTION_DAYS', 2555),
    ],
    'expert_consult_access_days' => max(
        0,
        (int) env('CANEGUARD_EXPERT_CONSULT_ACCESS_DAYS', 14),
    ),
    'expert_consult_invite_days' => max(
        1,
        (int) env('CANEGUARD_EXPERT_CONSULT_INVITE_DAYS', 7),
    ),
    'reports' => [
        // Report documents are embedded only by the authenticated web app.
        'embed_origins' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CANEGUARD_REPORT_EMBED_ORIGINS', 'self')),
        ))),
    ],
    'rate_limits' => [
        'login' => [
            'per_email_ip_per_minute' => max(
                1,
                (int) env('CANEGUARD_LOGIN_PER_EMAIL_IP_PER_MINUTE', 5),
            ),
            'qa_per_email_ip_per_minute' => max(
                1,
                (int) env('CANEGUARD_QA_LOGIN_PER_EMAIL_IP_PER_MINUTE', 60),
            ),
            // The documented Tailscale Funnel path presents one shared proxy IP.
            // Keep these aggregate backstops high enough for normal shared use;
            // deployments with client-IP forwarding should tune them to their traffic.
            'per_ip_per_minute' => max(
                1,
                (int) env('CANEGUARD_LOGIN_PER_IP_PER_MINUTE', 300),
            ),
            'global_per_minute' => max(
                1,
                (int) env('CANEGUARD_LOGIN_GLOBAL_PER_MINUTE', 3000),
            ),
        ],
    ],
    'demo_users' => [
        'field_reporter_password' => env('CANEGUARD_FIELD_PASSWORD'),
        'reviewer_password' => env('CANEGUARD_REVIEWER_PASSWORD'),
        'admin_password' => env('CANEGUARD_ADMIN_PASSWORD'),
        'expert_password' => env('CANEGUARD_EXPERT_PASSWORD'),
    ],
    'map' => [
        'default_limit' => min(
            1000,
            max(1, (int) env('CANEGUARD_MAP_DEFAULT_LIMIT', 1000)),
        ),
        'max_limit' => 1000,
    ],
    'duplicate_assistance' => [
        'recent_window_hours' => 72,
        'location_radius_meters' => 100,
        'max_matches' => 5,
        'max_candidates' => 200,
    ],
];
