# Graph Report - caneguard-web  (2026-08-19)

## Corpus Check
- 273 files · ~487,429 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1696 nodes · 2846 edges · 144 communities (118 shown, 26 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 171 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `03a502f5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Agent Rules
- Orchestrator Operating Manual
- report.types.ts
- Release Notes
- devDependencies
- compilerOptions
- Illuminate\Database\Eloquent\Relations\BelongsTo
- scripts
- compilerOptions
- CaseReviewPage.tsx
- UserFactory
- Social and Navigation Icon Sprite
- Vite Logo
- Layered Platform Illustration
- Masked Multicolor Glow
- React Logo
- tsconfig.json
- AkiDev Core Agent Rules
- CaneGuard Document Shell
- user.types.ts
- Architecture Operating Manual
- composer.json
- scripts
- Report
- devDependencies
- ApiError.ts
- api/README.md
- CaneGuard Monorepo Implementation Board
- artisan
- Illuminate\Http\JsonResponse
- DashboardSummaryController.php
- MapReportController.php
- Illuminate\Http\Request
- TestCase
- P0E — Resilient Offline Synchronization, Retry Policy, and Queue Draining
- StoreReport
- WebAuthenticationTest
- P0F — Full CaneGuard Cross-System Acceptance and Regression Gate
- AkiDev tool routing
- ExampleTest
- ReportMySqlSchemaTest
- ApplyReportFilters
- ReportController.php
- AuthProvider.tsx
- require-dev
- SymptomResponseItem.tsx
- ReportResource
- api.php
- router.tsx
- DashboardPage.tsx
- User
- Reviewer Operating Manual
- ReportPolicy
- FieldValidationMapPage.tsx
- Controller
- setup
- reportListUrlState.ts
- MobileReportSecurityContractMySqlTest
- Graph Mapper Operating Manual
- assets/README.md
- DatabaseSeeder.php
- MobileAuthenticationTest
- SubmittedReportsPage.tsx
- P0B — Reliable Physical-Device API Connectivity and API Reachability
- Implementer Operating Manual
- P0C — Field-Validation Map Reliability and Failure Diagnostics
- ApiFormRequest
- config
- HealthEndpointTest
- LocationReferenceTest
- Illuminate\Foundation\Application
- Project Context
- psr-4
- require
- post-create-project-cmd
- Maestro Runtime Verification
- ApiConnectivityProvider.tsx
- extra
- P0A — Canonical Mobile ↔ API Authority Review Contract
- P0D — Web Data Freshness and React Query Cache Consistency
- Test M1 — Create/finalize offline, restart app, recover automatically
- axiosClient.ts
- Project Verification Commands
- ValidationMap.tsx
- Engineering
- AppProviders.tsx
- Project Stack Guide — Laravel + React
- Security
- Plan Feature
- Ship Feature
- Verification
- AuthenticatedUserRequest
- Physical Android API connectivity
- Graph Map
- Quick Fix
- Review Feature
- ApiConnectivityProvider.test.tsx
- Mobile report review status contract
- Database Review
- Security Review
- ReportMapAndQueueTest
- backend.md
- context-efficiency.md
- database.md
- deployment.md
- frontend.md
- rules/review.md
- testing.md
- CaneGuard Web

## God Nodes (most connected - your core abstractions)
1. `User` - 105 edges
2. `Report` - 88 edges
3. `Release Notes` - 43 edges
4. `TestCase` - 37 edges
5. `Controller` - 30 edges
6. `MobileReportUploadTest` - 29 edges
7. `Orchestrator Operating Manual` - 21 edges
8. `FieldValidationFilters` - 19 edges
9. `Architecture Operating Manual` - 19 edges
10. `Implementer Operating Manual` - 19 edges

## Surprising Connections (you probably didn't know these)
- `ReportListUrlState` --references--> `ReportFilters`  [EXTRACTED]
  src/pages/reportListUrlState.ts → src/domain/report.types.ts
- `QueryMapReports` --references--> `ApplyReportFilters`  [EXTRACTED]
  api/app/Actions/Reports/QueryMapReports.php → api/app/Actions/Reports/ApplyReportFilters.php
- `HealthController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/HealthController.php → api/app/Http/Controllers/Controller.php
- `AuthenticatedUserController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/AuthenticatedUserController.php → api/app/Http/Controllers/Controller.php
- `DashboardSummaryController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/DashboardSummaryController.php → api/app/Http/Controllers/Controller.php

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Favicon Brand Mark Composition** — public_favicon_brand_mark, public_favicon_lightning_silhouette, public_favicon_masked_glow, public_favicon_blur_filters [INFERRED 0.95]
- **Social Platform Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_x_icon [INFERRED 0.95]
- **React Atomic Symbol Composition** — src_assets_react_logo, src_assets_react_atomic_orbits, src_assets_react_central_nucleus, src_assets_react_cyan_brand_color [INFERRED 0.95]
- **Vite Visual Identity Composition** — src_assets_vite_lightning_bolt, src_assets_vite_parentheses, src_assets_vite_glow_effect [INFERRED 0.95]

## Communities (144 total, 26 thin omitted)

### Community 0 - "Core Agent Rules"
Cohesion: 0.40
Nodes (5): Core Agent Rules, Graphify-First Codebase Workflow, Progressive Context, Task Risk Workflows, Verification and Reporting

### Community 1 - "Orchestrator Operating Manual"
Cohesion: 0.06
Nodes (32): AkiDev mobile/E2E intent gate, Architecture, Autonomous execution loop, Completion criteria, Context strategy, Core principles, Database policy, Delegation model (+24 more)

### Community 2 - "report.types.ts"
Cohesion: 0.06
Nodes (52): ApiDashboardRepository, ApiReportsRepository, sortValues, toQueryParams(), mapDashboard(), humanize(), mapPaginationMeta(), mapReportDetail() (+44 more)

### Community 3 - "Release Notes"
Cohesion: 0.05
Nodes (43): Release Notes, [Unreleased](https://github.com/laravel/laravel/compare/v13.7.0...13.x), [v12.0.0 (2025-??-??)](https://github.com/laravel/laravel/compare/v11.0.2...v12.0.0), [v12.0.10](https://github.com/laravel/laravel/compare/v12.0.9...v12.0.10) - 2025-06-09, [v12.0.11](https://github.com/laravel/laravel/compare/v12.0.10...v12.0.11) - 2025-06-10, [v12.0.1](https://github.com/laravel/laravel/compare/v12.0.0...v12.0.1) - 2025-02-24, [v12.0.2](https://github.com/laravel/laravel/compare/v12.0.1...v12.0.2) - 2025-03-04, [v12.0.3](https://github.com/laravel/laravel/compare/v12.0.2...v12.0.3) - 2025-03-17 (+35 more)

### Community 4 - "devDependencies"
Cohesion: 0.05
Nodes (41): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom, msw, devDependencies (+33 more)

### Community 5 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 6 - "Illuminate\Database\Eloquent\Relations\BelongsTo"
Cohesion: 0.21
Nodes (5): ReportClassScore, ReportQualityWarning, ReportSymptom, Illuminate\Database\Eloquent\Model, Illuminate\Database\Eloquent\Relations\BelongsTo

### Community 7 - "scripts"
Cohesion: 0.04
Nodes (45): axios, lucide-react, maplibre-gl, dependencies, axios, lucide-react, maplibre-gl, react (+37 more)

### Community 8 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "CaseReviewPage.tsx"
Cohesion: 0.17
Nodes (19): DashboardRecentReports(), ConfidenceDisplay(), EvidenceThumbnail(), DiseaseBadge(), ReviewStatusBadge(), ReportTable(), ImagePendingState(), authorityClassifiedConditionLabels (+11 more)

### Community 10 - "UserFactory"
Cohesion: 0.21
Nodes (5): static, ReportFactory, static, UserFactory, Illuminate\Database\Eloquent\Factories\Factory

### Community 11 - "Social and Navigation Icon Sprite"
Cohesion: 0.46
Nodes (8): Bluesky Icon Clip Path, Bluesky Icon, Discord Icon, Documentation and Code Icon, GitHub Icon, Social and Navigation Icon Sprite, Social Profile Icon, X Social Network Icon

### Community 12 - "Vite Logo"
Cohesion: 0.38
Nodes (7): Accessible Vite Title, Vite, Dark Mode Color Adaptation, Purple and Cyan Glow Effect, Purple Lightning Bolt, Vite Logo, Adaptive Parentheses

### Community 13 - "Layered Platform Illustration"
Cohesion: 0.50
Nodes (5): Layered Platform Illustration, Layered System Architecture, Lower Purple Layer, Upper Floating Layer, Vertical Separation Guides

### Community 14 - "Masked Multicolor Glow"
Cohesion: 0.67
Nodes (4): Gaussian Blur Filter Set, Purple Lightning Bolt Brand Mark, Angular Lightning Silhouette, Masked Multicolor Glow

### Community 15 - "React Logo"
Cohesion: 0.67
Nodes (4): Three Intersecting Atomic Orbits, Central Circular Nucleus, React Cyan Brand Color, React Logo

### Community 17 - "AkiDev Core Agent Rules"
Cohesion: 0.12
Nodes (15): 1. Scope and safety, 2. Autonomy, 3. Task classification, 4. Progressive context, 5. Engineering principles, 6. External tools and skills, 7. Verification, 8. Failure handling (+7 more)

### Community 20 - "Architecture Operating Manual"
Cohesion: 0.07
Nodes (29): API design, Architecture Operating Manual, Assumptions, Confirmed facts, Contracts and data, Current flow, Data design, Expo / React Native guidance (+21 more)

### Community 23 - "composer.json"
Cohesion: 0.14
Nodes (13): autoload-dev, psr-4, description, keywords, license, minimum-stability, name, prefer-stable (+5 more)

### Community 24 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, dev, post-autoload-dump, post-update-cmd, pre-package-uninstall, test, Composer\\Config::disableProcessTimeout, Illuminate\\Foundation\\ComposerScripts::postAutoloadDump (+6 more)

### Community 25 - "Report"
Cohesion: 0.08
Nodes (5): Report, ReportApiTest, ReviewReportTest, SecureReportImagesCommandTest, Illuminate\Database\Eloquent\Relations\HasMany

### Community 26 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, @tailwindcss/vite (+9 more)

### Community 27 - "ApiError.ts"
Cohesion: 0.26
Nodes (7): ApiError, errorPayloadSchema, createQueryClient(), isTransientServerError(), shouldRetryQuery(), pageData, renderPage()

### Community 28 - "api/README.md"
Cohesion: 0.22
Nodes (8): About Laravel, Agentic Development, Code of Conduct, Contributing, Learning Laravel, License, Mobile report review status contract, Security Vulnerabilities

### Community 29 - "CaneGuard Monorepo Implementation Board"
Cohesion: 0.08
Nodes (25): Accepted manual release follow-ups, CaneGuard Monorepo Implementation Board, Existing user work preserved, Phase 0 baseline, Phase 1 foundation, Phase 1 verification, Phase 2 report API and storage, Phase 2 verification (+17 more)

### Community 36 - "Illuminate\Http\JsonResponse"
Cohesion: 0.15
Nodes (5): HealthController, MobileAuthController, MobileLoginRequest, MobileSessionRequest, Illuminate\Http\JsonResponse

### Community 49 - "MapReportController.php"
Cohesion: 0.24
Nodes (3): QueryMapReports, MapReportController, MapReportsRequest

### Community 52 - "Illuminate\Http\Request"
Cohesion: 0.26
Nodes (6): FieldValidationQueueResource, MapReportResource, ReportListResource, ReportStatusResource, Illuminate\Http\Request, Illuminate\Http\Resources\Json\JsonResource

### Community 57 - "TestCase"
Cohesion: 0.09
Nodes (14): DemoUserSeederTest, ExampleTest, ReportSchemaAndSeederTest, SanctumInstallationTest, ReleaseDemoFlowMySqlTest, TestCase, Illuminate\Database\Eloquent\Collection, Illuminate\Database\Eloquent\Concerns\HasUuids (+6 more)

### Community 58 - "P0E — Resilient Offline Synchronization, Retry Policy, and Queue Draining"
Cohesion: 0.05
Nodes (37): 1. Keep current sync statuses, 2. Create one persisted retry policy, 3. General "Sync now" should not bulk-hammer permanent failures, 4. Keep immediate retries and add cross-run cooldown, 5. Drain the queue in bounded batches, Acceptance criteria, API unavailable / recovery with wireless ADB, Automated test matrix — Wi-Fi stays ON (+29 more)

### Community 59 - "StoreReport"
Cohesion: 0.16
Nodes (7): PersistReport, StoreReport, SecureReportImages, Illuminate\Console\Command, Illuminate\Filesystem\FilesystemAdapter, Illuminate\Http\UploadedFile, Throwable

### Community 61 - "P0F — Full CaneGuard Cross-System Acceptance and Regression Gate"
Cohesion: 0.05
Nodes (36): A. API server unavailable while Wi-Fi remains ON, Acceptance criteria, B. Duplicate upload/idempotency, Baseline automated gates, C. Queue > 10, Canonical full-system scenario, D. One permanent invalid report among valid reports, Definition of done (+28 more)

### Community 62 - "AkiDev tool routing"
Cohesion: 0.40
Nodes (4): AkiDev tool routing, Choose the smallest sufficient path, Explicit mobile intent gate and device ownership, Shared prerequisite policy

### Community 67 - "ApplyReportFilters"
Cohesion: 0.14
Nodes (7): ApplyReportFilters, QueryFieldValidationQueue, QueryReports, FieldValidationQueueController, FieldValidationQueueRequest, Illuminate\Contracts\Pagination\LengthAwarePaginator, Illuminate\Database\Eloquent\Builder

### Community 68 - "ReportController.php"
Cohesion: 0.13
Nodes (6): MobileReportStatusController, ReportController, ListReportsRequest, ReportFilterRules, ReportStatusesRequest, Illuminate\Http\Resources\Json\AnonymousResourceCollection

### Community 69 - "AuthProvider.tsx"
Cohesion: 0.18
Nodes (19): axiosClient, getCurrentUser(), initializeCsrf(), isWebRole(), loginRequest(), logoutRequest(), userResponseSchema, WebRoleError (+11 more)

### Community 70 - "require-dev"
Cohesion: 0.25
Nodes (8): require-dev, fakerphp/faker, laravel/pail, laravel/pao, laravel/pint, mockery/mockery, nunomaduro/collision, phpunit/phpunit

### Community 71 - "SymptomResponseItem.tsx"
Cohesion: 0.50
Nodes (3): answerLabels, SymptomResponseItem(), SymptomResponse

### Community 72 - "ReportResource"
Cohesion: 0.28
Nodes (3): ReviewReportController, ReviewReportRequest, ReportResource

### Community 74 - "router.tsx"
Cohesion: 0.20
Nodes (12): routes, RequireAuth(), useAuth(), AppHeader(), initials(), AppShell(), AppSidebar(), futureLinks (+4 more)

### Community 75 - "DashboardPage.tsx"
Cohesion: 0.14
Nodes (13): SecondaryMetric(), MetricCard(), Button(), ButtonProps, ButtonVariant, EmptyState(), ErrorState(), LoadingState() (+5 more)

### Community 76 - "User"
Cohesion: 0.10
Nodes (4): User, MobileReportStatusTest, MobileReportUploadTest, Illuminate\Foundation\Auth\User

### Community 77 - "Reviewer Operating Manual"
Cohesion: 0.09
Nodes (22): API review, Completion criteria, Correctness review, Critical, Database review, Expo / mobile review, Finding format, Frontend review (+14 more)

### Community 78 - "ReportPolicy"
Cohesion: 0.15
Nodes (3): ReportPolicy, AppServiceProvider, Illuminate\Support\ServiceProvider

### Community 79 - "FieldValidationMapPage.tsx"
Cohesion: 0.06
Nodes (52): FieldValidationFilterBar(), FieldValidationFilterBarProps, ApiFieldValidationRepository, toQueryParams(), mapFieldValidationMap(), mapFieldValidationQueue(), mapQueueItem(), FieldValidationQueueItemDto (+44 more)

### Community 80 - "Controller"
Cohesion: 0.18
Nodes (7): LocationReferenceController, ReportImageController, LogoutController, Controller, Illuminate\Foundation\Auth\Access\AuthorizesRequests, Illuminate\Http\Response, Symfony\Component\HttpFoundation\StreamedResponse

### Community 82 - "setup"
Cohesion: 0.25
Nodes (8): post-root-package-install, setup, composer install, npm install --ignore-scripts, npm run build, @php artisan key:generate, @php artisan migrate --force, @php -r \"file_exists('.env') || copy('.env.example', '.env');\

### Community 83 - "reportListUrlState.ts"
Cohesion: 0.27
Nodes (8): dateSchema, diseaseSchema, optionalValue(), parseReportListUrl(), reportListPageSize, ReportListUrlState, sortSchema, statusSchema

### Community 85 - "Graph Mapper Operating Manual"
Cohesion: 0.09
Nodes (21): Boundaries and ownership, Change blast radius, Change blast radius, Cross-cutting behavior, Data flow, Dependencies, Entry points, Evidence notes (+13 more)

### Community 87 - "DatabaseSeeder.php"
Cohesion: 0.36
Nodes (4): DatabaseSeeder, ReportSeeder, Illuminate\Database\Console\Seeds\WithoutModelEvents, Illuminate\Database\Seeder

### Community 89 - "SubmittedReportsPage.tsx"
Cohesion: 0.12
Nodes (20): DetailField(), PageContent(), PageHeader(), SearchInput(), SearchInputProps, SelectFilter(), SelectFilterProps, TextArea() (+12 more)

### Community 91 - "P0B — Reliable Physical-Device API Connectivity and API Reachability"
Cohesion: 0.06
Nodes (31): Acceptance criteria, Automated test plan — Wi-Fi remains ON, Commands, Current verified code context, Definition of done, Design decision: API health is diagnostic, not a hard gate, Implementation phases, Important test constraint: wireless debugging (+23 more)

### Community 92 - "Implementer Operating Manual"
Cohesion: 0.10
Nodes (19): API implementation, Before editing, Completion criteria, Correctness checklist, Database changes, Dependencies, Expo / React Native implementation, Failure recovery (+11 more)

### Community 93 - "P0C — Field-Validation Map Reliability and Failure Diagnostics"
Cohesion: 0.07
Nodes (29): Acceptance criteria, Automated test plan, Backend, Commands, Component tests, Configuration, Current verified code context, Definition of done (+21 more)

### Community 95 - "ApiFormRequest"
Cohesion: 0.20
Nodes (5): LoginController, ApiFormRequest, LoginRequest, Illuminate\Contracts\Validation\Validator, Illuminate\Foundation\Http\FormRequest

### Community 96 - "config"
Cohesion: 0.29
Nodes (7): pestphp/pest-plugin, php-http/discovery, config, allow-plugins, optimize-autoloader, preferred-install, sort-packages

### Community 101 - "Project Context"
Cohesion: 0.17
Nodes (11): Architecture, Constraints, Current priorities, External contracts, Important conventions, Known debt or limitations, Project Context, Purpose (+3 more)

### Community 102 - "psr-4"
Cohesion: 0.40
Nodes (5): autoload, psr-4, App\\, Database\\Factories\\, Database\\Seeders\\

### Community 103 - "require"
Cohesion: 0.40
Nodes (5): require, laravel/framework, laravel/sanctum, laravel/tinker, php

### Community 104 - "post-create-project-cmd"
Cohesion: 0.50
Nodes (4): post-create-project-cmd, @php artisan key:generate --ansi, @php artisan migrate --graceful --ansi, @php -r \"file_exists('database/database.sqlite') || touch('database/database.sqlite');\

### Community 105 - "Maestro Runtime Verification"
Cohesion: 0.20
Nodes (9): Core rule, Decision, Maestro Runtime Verification, Misleading-failure protection, Native-runtime freshness assessment, Reporting, Runtime stale, unknown, or rebuild required, Runtime usable (+1 more)

### Community 106 - "ApiConnectivityProvider.tsx"
Cohesion: 0.14
Nodes (21): ApiConnectivityContext, ApiConnectivitySnapshot, NetworkStatus, useApiConnectivity(), Probe(), ApiHealthChecks, apiHealthClient, ApiHealthResult (+13 more)

### Community 107 - "extra"
Cohesion: 0.67
Nodes (3): extra, laravel, dont-discover

### Community 109 - "P0A — Canonical Mobile ↔ API Authority Review Contract"
Cohesion: 0.07
Nodes (27): Acceptance criteria, Automated verification, CaneGuard Mobile, `caneguard-mobile`, `caneguard-web`, CaneGuard Web / API, Contract flow, Current verified code context (+19 more)

### Community 110 - "P0D — Web Data Freshness and React Query Cache Consistency"
Cohesion: 0.07
Nodes (27): Acceptance criteria, Commands, Current verified code context, Definition of done, Design decision, Field-validation keys, Implementation phases, Integration-level web test (+19 more)

### Community 111 - "Test M1 — Create/finalize offline, restart app, recover automatically"
Cohesion: 0.08
Nodes (25): Cleanup, Evidence to capture, Final manual acceptance criteria, Final sign-off, Important safety rules, Manual Acceptance — True Wi-Fi Offline and Recovery Test, Optional Test M3 — Network loss during an active multi-report queue, Pass/fail summary (+17 more)

### Community 112 - "axiosClient.ts"
Cohesion: 0.18
Nodes (11): toApiError(), createApiHealthClient(), createAxiosClient(), listeners, notifySessionExpired(), SessionExpiredListener, subscribeToSessionExpiration(), mapDto (+3 more)

### Community 113 - "Project Verification Commands"
Cohesion: 0.29
Nodes (6): Broader checks, Database checks, Fast checks, Manual verification, Project Verification Commands, Rules

### Community 114 - "ValidationMap.tsx"
Cohesion: 0.20
Nodes (12): formatValidationDate(), FieldValidationQueuePanel(), QueueItem(), queueItemMeta(), FieldValidationTable(), MapLegend(), pointFilter, PointPopup() (+4 more)

### Community 115 - "Engineering"
Cohesion: 0.33
Nodes (5): Compatibility, Correctness, Design, Engineering, Maintainability

### Community 116 - "AppProviders.tsx"
Cohesion: 0.24
Nodes (6): App(), AppProviders(), queryClient, AppRouter(), renderApp(), webUser

### Community 117 - "Project Stack Guide — Laravel + React"
Cohesion: 0.33
Nodes (5): Documentation, Integration boundary, Laravel, Project Stack Guide — Laravel + React, React

### Community 118 - "Security"
Cohesion: 0.40
Nodes (4): Baseline expectations, Review behavior, Security, Trust boundaries

### Community 119 - "Plan Feature"
Cohesion: 0.40
Nodes (4): Complete when, Decision rules, Plan Feature, Workflow

### Community 120 - "Ship Feature"
Cohesion: 0.40
Nodes (4): Escalate, Risky operations, Ship Feature, Workflow

### Community 121 - "Verification"
Cohesion: 0.40
Nodes (4): Evidence ladder, Principles, Report, Verification

### Community 122 - "AuthenticatedUserRequest"
Cohesion: 0.24
Nodes (3): AuthenticatedUserController, AuthenticatedUserRequest, AuthenticatedUserResource

### Community 123 - "Physical Android API connectivity"
Cohesion: 0.25
Nodes (7): Checking the two connectivity states, Fallback when ADB reverse is unreliable, Physical Android API connectivity, Primary workflow, Troubleshooting, Why this is the team default, Wireless-debugging test rules

### Community 124 - "Graph Map"
Cohesion: 0.50
Nodes (3): Graph Map, Graphify, Map

### Community 125 - "Quick Fix"
Cohesion: 0.50
Nodes (3): Escalate when, Quick Fix, Workflow

### Community 126 - "Review Feature"
Cohesion: 0.50
Nodes (3): Finding quality, Review Feature, Review priority

### Community 127 - "ApiConnectivityProvider.test.tsx"
Cohesion: 0.32
Nodes (7): ApiConnectivityProvider(), getInitialNetworkStatus(), authValue(), renderProvider(), SessionHarness(), user, AuthStatus

### Community 128 - "Mobile report review status contract"
Cohesion: 0.50
Nodes (3): Mobile report review status contract, Read status snapshots, Review mutation and retry behavior

## Knowledge Gaps
- **653 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+648 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Report` connect `Report` to `ApplyReportFilters`, `ReportController.php`, `ReportMapAndQueueTest`, `Illuminate\Database\Eloquent\Relations\BelongsTo`, `ReportResource`, `api.php`, `UserFactory`, `User`, `DashboardSummaryController.php`, `ReportPolicy`, `Controller`, `MapReportController.php`, `MobileReportSecurityContractMySqlTest`, `DatabaseSeeder.php`, `TestCase`, `StoreReport`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `User` connect `User` to `ReportMapAndQueueTest`, `Illuminate\Http\JsonResponse`, `UserFactory`, `ReportPolicy`, `MobileReportSecurityContractMySqlTest`, `DatabaseSeeder.php`, `MobileAuthenticationTest`, `TestCase`, `StoreReport`, `WebAuthenticationTest`, `Report`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `TestCase` connect `TestCase` to `ReportMySqlSchemaTest`, `HealthEndpointTest`, `LocationReferenceTest`, `ReportMapAndQueueTest`, `Illuminate\Foundation\Application`, `User`, `MobileReportSecurityContractMySqlTest`, `MobileAuthenticationTest`, `Report`, `WebAuthenticationTest`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `User` (e.g. with `.login()` and `.definition()`) actually correct?**
  _`User` has 82 INFERRED edges - model-reasoned connections that need verification._
- **Are the 59 inferred relationships involving `Report` (e.g. with `.handle()` and `.handle()`) actually correct?**
  _`Report` has 59 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _653 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orchestrator Operating Manual` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._