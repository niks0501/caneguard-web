# Graph Report - caneguard-web  (2026-08-17)

## Corpus Check
- 259 files · ~143,998 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1441 nodes · 2545 edges · 134 communities (104 shown, 30 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 170 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `966c45d2`
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
- ReportTable.tsx
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
- ApiFormRequest
- MapReportController.php
- Illuminate\Http\Request
- TestCase
- MobileReportStatusTest
- StoreReport
- WebAuthenticationTest
- useAuth
- AkiDev tool routing
- ExampleTest
- ReportMySqlSchemaTest
- ApplyReportFilters
- ReportController.php
- AuthProvider.tsx
- require-dev
- CaseReviewPage.tsx
- ReportResource
- MobileReportController.php
- router.tsx
- DashboardPage.tsx
- User
- Reviewer Operating Manual
- AppServiceProvider.php
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
- ReportApiTest
- Implementer Operating Manual
- FieldValidationQueueController.php
- LoginRequest
- config
- HealthEndpointTest
- LocationReferenceTest
- Illuminate\Foundation\Application
- Project Context
- psr-4
- require
- post-create-project-cmd
- Maestro Runtime Verification
- ReleaseDemoFlowMySqlTest
- extra
- Project Verification Commands
- Engineering
- Project Stack Guide — Laravel + React
- Security
- Plan Feature
- Ship Feature
- Verification
- Graph Map
- Quick Fix
- Review Feature
- Mobile report review status contract
- Database Review
- Security Review
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
- `renderPage()` --calls--> `createQueryClient()`  [EXTRACTED]
  src/pages/SubmittedReportsPage.test.tsx → src/app/queryClient.ts
- `ReportListUrlState` --references--> `ReportFilters`  [EXTRACTED]
  src/pages/reportListUrlState.ts → src/domain/report.types.ts
- `HealthController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/HealthController.php → api/app/Http/Controllers/Controller.php
- `DashboardSummaryController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/DashboardSummaryController.php → api/app/Http/Controllers/Controller.php
- `FieldValidationQueueController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/FieldValidationQueueController.php → api/app/Http/Controllers/Controller.php

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Favicon Brand Mark Composition** — public_favicon_brand_mark, public_favicon_lightning_silhouette, public_favicon_masked_glow, public_favicon_blur_filters [INFERRED 0.95]
- **Social Platform Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_x_icon [INFERRED 0.95]
- **React Atomic Symbol Composition** — src_assets_react_logo, src_assets_react_atomic_orbits, src_assets_react_central_nucleus, src_assets_react_cyan_brand_color [INFERRED 0.95]
- **Vite Visual Identity Composition** — src_assets_vite_lightning_bolt, src_assets_vite_parentheses, src_assets_vite_glow_effect [INFERRED 0.95]

## Communities (134 total, 30 thin omitted)

### Community 0 - "Core Agent Rules"
Cohesion: 0.40
Nodes (5): Core Agent Rules, Graphify-First Codebase Workflow, Progressive Context, Task Risk Workflows, Verification and Reporting

### Community 1 - "Orchestrator Operating Manual"
Cohesion: 0.06
Nodes (32): AkiDev mobile/E2E intent gate, Architecture, Autonomous execution loop, Completion criteria, Context strategy, Core principles, Database policy, Delegation model (+24 more)

### Community 2 - "report.types.ts"
Cohesion: 0.06
Nodes (53): ApiDashboardRepository, ApiReportsRepository, sortValues, toQueryParams(), mapDashboard(), humanize(), mapPaginationMeta(), mapReportDetail() (+45 more)

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

### Community 9 - "ReportTable.tsx"
Cohesion: 0.23
Nodes (11): DashboardRecentReports(), ConfidenceDisplay(), EvidenceThumbnail(), DiseaseBadge(), ReviewStatusBadge(), ReportTable(), submitterRoleLabels, ImageStatus (+3 more)

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
Nodes (5): Report, ReportMapAndQueueTest, ReviewReportTest, SecureReportImagesCommandTest, Illuminate\Database\Eloquent\Relations\HasMany

### Community 26 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, @tailwindcss/vite (+9 more)

### Community 27 - "ApiError.ts"
Cohesion: 0.23
Nodes (9): ApiError, errorPayloadSchema, createQueryClient(), isTransientServerError(), shouldRetryQuery(), ServerStatus(), ServerStatusValue, queryClient() (+1 more)

### Community 28 - "api/README.md"
Cohesion: 0.22
Nodes (8): About Laravel, Agentic Development, Code of Conduct, Contributing, Learning Laravel, License, Mobile report review status contract, Security Vulnerabilities

### Community 29 - "CaneGuard Monorepo Implementation Board"
Cohesion: 0.08
Nodes (25): Accepted manual release follow-ups, CaneGuard Monorepo Implementation Board, Existing user work preserved, Phase 0 baseline, Phase 1 foundation, Phase 1 verification, Phase 2 report API and storage, Phase 2 verification (+17 more)

### Community 36 - "Illuminate\Http\JsonResponse"
Cohesion: 0.14
Nodes (5): MobileAuthController, LogoutController, MobileLoginRequest, MobileSessionRequest, Illuminate\Http\JsonResponse

### Community 46 - "ApiFormRequest"
Cohesion: 0.16
Nodes (6): DashboardSummaryController, ApiFormRequest, DashboardSummaryRequest, ReportListResource, Illuminate\Contracts\Validation\Validator, Illuminate\Foundation\Http\FormRequest

### Community 49 - "MapReportController.php"
Cohesion: 0.20
Nodes (3): MapReportController, MapReportsRequest, ReportFilterRules

### Community 52 - "Illuminate\Http\Request"
Cohesion: 0.23
Nodes (6): AuthenticatedUserResource, FieldValidationQueueResource, MapReportResource, ReportStatusResource, Illuminate\Http\Request, Illuminate\Http\Resources\Json\JsonResource

### Community 57 - "TestCase"
Cohesion: 0.12
Nodes (12): DemoUserSeederTest, ExampleTest, ReportSchemaAndSeederTest, SanctumInstallationTest, TestCase, Illuminate\Database\Eloquent\Concerns\HasUuids, Illuminate\Database\Eloquent\Factories\HasFactory, Illuminate\Foundation\Testing\DatabaseTransactions (+4 more)

### Community 59 - "StoreReport"
Cohesion: 0.13
Nodes (8): PersistReport, StoreReport, SecureReportImages, HealthController, Illuminate\Console\Command, Illuminate\Filesystem\FilesystemAdapter, Illuminate\Http\UploadedFile, Throwable

### Community 61 - "useAuth"
Cohesion: 0.44
Nodes (5): useAuth(), AppHeader(), initials(), AppSidebar(), futureLinks

### Community 62 - "AkiDev tool routing"
Cohesion: 0.40
Nodes (4): AkiDev tool routing, Choose the smallest sufficient path, Explicit mobile intent gate and device ownership, Shared prerequisite policy

### Community 67 - "ApplyReportFilters"
Cohesion: 0.15
Nodes (7): ApplyReportFilters, QueryFieldValidationQueue, QueryMapReports, QueryReports, Illuminate\Contracts\Pagination\LengthAwarePaginator, Illuminate\Database\Eloquent\Builder, Illuminate\Database\Eloquent\Collection

### Community 68 - "ReportController.php"
Cohesion: 0.17
Nodes (5): MobileReportStatusController, ReportController, ListReportsRequest, ReportStatusesRequest, Illuminate\Http\Resources\Json\AnonymousResourceCollection

### Community 69 - "AuthProvider.tsx"
Cohesion: 0.07
Nodes (39): toApiError(), axiosClient, createAxiosClient(), App(), AppProviders(), queryClient, AppRouter(), getCurrentUser() (+31 more)

### Community 70 - "require-dev"
Cohesion: 0.25
Nodes (8): require-dev, fakerphp/faker, laravel/pail, laravel/pao, laravel/pint, mockery/mockery, nunomaduro/collision, phpunit/phpunit

### Community 71 - "CaseReviewPage.tsx"
Cohesion: 0.12
Nodes (17): DetailField(), PageContent(), PageHeader(), answerLabels, SymptomResponseItem(), SearchInput(), SearchInputProps, SelectFilter() (+9 more)

### Community 72 - "ReportResource"
Cohesion: 0.28
Nodes (3): ReviewReportController, ReviewReportRequest, ReportResource

### Community 74 - "router.tsx"
Cohesion: 0.19
Nodes (13): routes, RequireAuth(), AppShell(), Button(), ButtonProps, ButtonVariant, ErrorState(), LoadingState() (+5 more)

### Community 75 - "DashboardPage.tsx"
Cohesion: 0.23
Nodes (7): SecondaryMetric(), MetricCard(), EmptyState(), useDashboard(), DashboardPage(), formatRefreshTime(), summary

### Community 76 - "User"
Cohesion: 0.12
Nodes (4): User, ReportPolicy, MobileReportUploadTest, Illuminate\Foundation\Auth\User

### Community 77 - "Reviewer Operating Manual"
Cohesion: 0.09
Nodes (22): API review, Completion criteria, Correctness review, Critical, Database review, Expo / mobile review, Finding format, Frontend review (+14 more)

### Community 79 - "FieldValidationMapPage.tsx"
Cohesion: 0.05
Nodes (66): formatValidationDate(), FieldValidationFilterBar(), FieldValidationFilterBarProps, FieldValidationQueuePanel(), QueueItem(), queueItemMeta(), FieldValidationTable(), MapLegend() (+58 more)

### Community 80 - "Controller"
Cohesion: 0.15
Nodes (8): AuthenticatedUserController, LocationReferenceController, ReportImageController, Controller, AuthenticatedUserRequest, Illuminate\Foundation\Auth\Access\AuthorizesRequests, Illuminate\Http\Response, Symfony\Component\HttpFoundation\StreamedResponse

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
Cohesion: 0.16
Nodes (13): Pagination(), PaginationProps, visiblePages(), NoResultsState(), useReports(), FilterKey, isAccessDeniedError(), isInvalidQueryError() (+5 more)

### Community 92 - "Implementer Operating Manual"
Cohesion: 0.10
Nodes (19): API implementation, Before editing, Completion criteria, Correctness checklist, Database changes, Dependencies, Expo / React Native implementation, Failure recovery (+11 more)

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

### Community 107 - "extra"
Cohesion: 0.67
Nodes (3): extra, laravel, dont-discover

### Community 113 - "Project Verification Commands"
Cohesion: 0.29
Nodes (6): Broader checks, Database checks, Fast checks, Manual verification, Project Verification Commands, Rules

### Community 115 - "Engineering"
Cohesion: 0.33
Nodes (5): Compatibility, Correctness, Design, Engineering, Maintainability

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

### Community 124 - "Graph Map"
Cohesion: 0.50
Nodes (3): Graph Map, Graphify, Map

### Community 125 - "Quick Fix"
Cohesion: 0.50
Nodes (3): Escalate when, Quick Fix, Workflow

### Community 126 - "Review Feature"
Cohesion: 0.50
Nodes (3): Finding quality, Review Feature, Review priority

### Community 128 - "Mobile report review status contract"
Cohesion: 0.50
Nodes (3): Mobile report review status contract, Read status snapshots, Review mutation and retry behavior

## Knowledge Gaps
- **462 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+457 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Report` connect `Report` to `ApplyReportFilters`, `ReportController.php`, `Illuminate\Database\Eloquent\Relations\BelongsTo`, `ReportResource`, `MobileReportController.php`, `UserFactory`, `ReportApiTest`, `User`, `ReleaseDemoFlowMySqlTest`, `ApiFormRequest`, `AppServiceProvider.php`, `Controller`, `MapReportController.php`, `MobileReportSecurityContractMySqlTest`, `DatabaseSeeder.php`, `TestCase`, `MobileReportStatusTest`, `StoreReport`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `User` connect `User` to `Illuminate\Http\JsonResponse`, `UserFactory`, `ReportApiTest`, `ReleaseDemoFlowMySqlTest`, `AppServiceProvider.php`, `MobileReportSecurityContractMySqlTest`, `DatabaseSeeder.php`, `MobileAuthenticationTest`, `TestCase`, `MobileReportStatusTest`, `StoreReport`, `WebAuthenticationTest`, `Report`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `TestCase` connect `TestCase` to `ReportMySqlSchemaTest`, `HealthEndpointTest`, `LocationReferenceTest`, `Illuminate\Foundation\Application`, `ReleaseDemoFlowMySqlTest`, `User`, `MobileReportSecurityContractMySqlTest`, `MobileAuthenticationTest`, `Report`, `MobileReportStatusTest`, `ReportApiTest`, `WebAuthenticationTest`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `User` (e.g. with `.login()` and `.definition()`) actually correct?**
  _`User` has 82 INFERRED edges - model-reasoned connections that need verification._
- **Are the 59 inferred relationships involving `Report` (e.g. with `.handle()` and `.handle()`) actually correct?**
  _`Report` has 59 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _462 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orchestrator Operating Manual` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._