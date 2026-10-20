<?php

$normalizeReportEmbedOrigin = static function (string $origin): ?string {
    $origin = trim($origin);
    if ($origin === 'self') {
        return 'self';
    }
    if ($origin === '' || preg_match('/[\x00-\x20\x7f]/', $origin) === 1) {
        return null;
    }

    $parts = parse_url($origin);
    if (! is_array($parts)
        || ! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
        || ! isset($parts['host'])
        || isset($parts['user'])
        || isset($parts['pass'])
        || isset($parts['query'])
        || isset($parts['fragment'])
        || (isset($parts['path']) && ! in_array($parts['path'], ['', '/'], true))) {
        return null;
    }

    $host = strtolower((string) $parts['host']);
    $unbracketedHost = trim($host, '[]');
    if (str_contains($host, '*')
        || (filter_var($unbracketedHost, FILTER_VALIDATE_IP) === false
            && filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false)) {
        return null;
    }

    $port = $parts['port'] ?? null;
    if ($port !== null && ($port < 1 || $port > 65535)) {
        return null;
    }

    $normalizedHost = str_contains($unbracketedHost, ':')
        ? '['.$unbracketedHost.']'
        : $host;

    return strtolower((string) $parts['scheme']).'://'.$normalizedHost.($port === null ? '' : ':'.$port);
};

$frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/');
$frontendOrigin = $normalizeReportEmbedOrigin($frontendUrl);
$configuredReportEmbedOrigins = env('CANEGUARD_REPORT_EMBED_ORIGINS');
$reportEmbedOrigins = ['self', $frontendOrigin];
if ($configuredReportEmbedOrigins !== null) {
    array_push($reportEmbedOrigins, ...explode(',', (string) $configuredReportEmbedOrigins));
}
$reportEmbedOrigins = array_values(array_unique(array_filter(array_map(
    $normalizeReportEmbedOrigin,
    $reportEmbedOrigins,
))));

return [
    'legacy_public_storage_link' => public_path('storage'),
    'accounts_enabled' => env('CANEGUARD_ACCOUNTS_ENABLED', false),
    'self_registration_enabled' => env('CANEGUARD_SELF_REGISTRATION_ENABLED', false),
    'frontend_origin' => $frontendOrigin,
    // Both switches remain closed until the office certifies the pilot roster.
    'pilot_roster_certified' => env('CANEGUARD_PILOT_ROSTER_CERTIFIED', false),
    // Blank means no live district. Never infer membership from location/name.
    'pilot_district_code' => env('CANEGUARD_PILOT_DISTRICT_CODE', ''),
    // Recognition only: unknown bounded versions remain valid submitted evidence.
    'accepted_model_versions' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CANEGUARD_ACCEPTED_MODEL_VERSIONS', 'v1.0-mobilenetv2')),
    ))),
    'weekly_send_enabled' => env('CANEGUARD_WEEKLY_SEND_ENABLED', false),
    'weekly_appendix_enabled' => env('CANEGUARD_WEEKLY_APPENDIX_ENABLED', false),
    'auth' => [
        'verification_url' => env(
            'CANEGUARD_VERIFICATION_URL',
            $frontendUrl.'/verify-email',
        ),
        'password_reset_url' => env(
            'CANEGUARD_PASSWORD_RESET_URL',
            $frontendUrl.'/reset-password',
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
    'reports' => [
        // The frontend is the only default cross-origin embedder; optional additional embedders must be exact HTTP(S) origins.
        'embed_origins' => $reportEmbedOrigins,
    ],
    'seeders' => [
        'dashboard' => [
            // Include the current month plus this many recent calendar months.
            'months_back' => max(
                1,
                (int) env('CANEGUARD_DASHBOARD_SEED_MONTHS_BACK', 8),
            ),
            'reports_per_barangay_per_condition' => max(
                1,
                (int) env('CANEGUARD_DASHBOARD_SEED_REPORTS_PER_BARANGAY_CONDITION', 2),
            ),
            // Every Nth generated report enters field validation. The next
            // report in that cycle is completed validation work.
            'validation_spread' => max(
                2,
                (int) env('CANEGUARD_DASHBOARD_SEED_VALIDATION_SPREAD', 5),
            ),
            // Every Nth generated report is a closed case.
            'closure_spread' => max(
                2,
                (int) env('CANEGUARD_DASHBOARD_SEED_CLOSURE_SPREAD', 4),
            ),
        ],
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
    ],
    'map' => [
        'default_limit' => min(
            1000,
            max(1, (int) env('CANEGUARD_MAP_DEFAULT_LIMIT', 1000)),
        ),
        'max_limit' => 1000,
        'location_group_radius_meters' => max(1, (float) env('CANEGUARD_MAP_LOCATION_GROUP_RADIUS_METERS', 25)),
    ],
    'surveys' => [
        'read_default_limit' => 100,
        'read_max_limit' => 250,
    ],
    'duplicate_assistance' => [
        'recent_window_hours' => 72,
        'location_radius_meters' => 100,
        'max_matches' => 5,
        'max_candidates' => 200,
    ],
];
