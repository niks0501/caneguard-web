# Graph Report - caneguard-web  (2026-08-17)

## Corpus Check
- 227 files · ~138,191 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1297 nodes · 2153 edges · 124 communities (97 shown, 27 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eac97f5d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Agent Rules
- Orchestrator Operating Manual
- ApiReportsRepository.ts
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
- ApiFormRequest
- DashboardSummaryController.php
- ApiDashboardRepository.ts
- Illuminate\Http\Request
- TestCase
- User
- StoreReport
- WebAuthenticationTest
- axiosClient.ts
- AkiDev tool routing
- ExampleTest
- ReportMySqlSchemaTest
- ReportController.php
- MobileReportStatusController.php
- AuthProvider.tsx
- AuthenticatedUserRequest
- SubmittedReportsPage.tsx
- ReportResource
- api.php
- router.tsx
- DashboardPage.tsx
- MobileReportUploadTest
- Reviewer Operating Manual
- ReportPolicy
- report.schema.ts
- Controller
- useReports.ts
- report.types.ts
- MobileReportSecurityContractMySqlTest
- Graph Mapper Operating Manual
- assets/README.md
- CaseReviewPage.test.tsx
- Illuminate\Http\JsonResponse
- Pagination.tsx
- ReportApiTest
- Implementer Operating Manual
- LoginRequest
- Illuminate\Database\Eloquent\Relations\HasMany
- Project Context
- Maestro Runtime Verification
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
1. `User` - 100 edges
2. `Report` - 83 edges
3. `Release Notes` - 43 edges
4. `TestCase` - 35 edges
5. `MobileReportUploadTest` - 29 edges
6. `Controller` - 26 edges
7. `Orchestrator Operating Manual` - 21 edges
8. `Architecture Operating Manual` - 19 edges
9. `Implementer Operating Manual` - 19 edges
10. `scripts` - 18 edges

## Surprising Connections (you probably didn't know these)
- `HealthController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/HealthController.php → api/app/Http/Controllers/Controller.php
- `AuthenticatedUserController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/AuthenticatedUserController.php → api/app/Http/Controllers/Controller.php
- `DashboardSummaryController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/DashboardSummaryController.php → api/app/Http/Controllers/Controller.php
- `MobileAuthController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/MobileAuthController.php → api/app/Http/Controllers/Controller.php
- `MobileReportController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/MobileReportController.php → api/app/Http/Controllers/Controller.php

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Favicon Brand Mark Composition** — public_favicon_brand_mark, public_favicon_lightning_silhouette, public_favicon_masked_glow, public_favicon_blur_filters [INFERRED 0.95]
- **Social Platform Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_x_icon [INFERRED 0.95]
- **React Atomic Symbol Composition** — src_assets_react_logo, src_assets_react_atomic_orbits, src_assets_react_central_nucleus, src_assets_react_cyan_brand_color [INFERRED 0.95]
- **Vite Visual Identity Composition** — src_assets_vite_lightning_bolt, src_assets_vite_parentheses, src_assets_vite_glow_effect [INFERRED 0.95]

## Communities (124 total, 27 thin omitted)

### Community 0 - "Core Agent Rules"
Cohesion: 0.40
Nodes (5): Core Agent Rules, Graphify-First Codebase Workflow, Progressive Context, Task Risk Workflows, Verification and Reporting

### Community 1 - "Orchestrator Operating Manual"
Cohesion: 0.06
Nodes (32): AkiDev mobile/E2E intent gate, Architecture, Autonomous execution loop, Completion criteria, Context strategy, Core principles, Database policy, Delegation model (+24 more)

### Community 2 - "ApiReportsRepository.ts"
Cohesion: 0.14
Nodes (13): axiosClient, ApiReportsRepository, sortValues, toQueryParams(), humanize(), mapPaginationMeta(), mapReportDetail(), reportListResponseSchema (+5 more)

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
Cohesion: 0.05
Nodes (41): axios, lucide-react, dependencies, axios, lucide-react, react, react-dom, react-router (+33 more)

### Community 8 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "CaseReviewPage.tsx"
Cohesion: 0.14
Nodes (23): DashboardRecentReports(), DetailField(), PageContent(), PageHeader(), ConfidenceDisplay(), EvidenceThumbnail(), DiseaseBadge(), ReviewStatusBadge() (+15 more)

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
Cohesion: 0.05
Nodes (41): pestphp/pest-plugin, php-http/discovery, autoload, autoload-dev, psr-4, psr-4, config, allow-plugins (+33 more)

### Community 24 - "scripts"
Cohesion: 0.08
Nodes (26): scripts, dev, post-autoload-dump, post-create-project-cmd, post-root-package-install, post-update-cmd, pre-package-uninstall, setup (+18 more)

### Community 26 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, @tailwindcss/vite (+9 more)

### Community 27 - "ApiError.ts"
Cohesion: 0.18
Nodes (11): ApiError, errorPayloadSchema, createQueryClient(), isTransientServerError(), shouldRetryQuery(), ServerStatus(), ServerStatusValue, queryClient() (+3 more)

### Community 28 - "api/README.md"
Cohesion: 0.22
Nodes (8): About Laravel, Agentic Development, Code of Conduct, Contributing, Learning Laravel, License, Mobile report review status contract, Security Vulnerabilities

### Community 29 - "CaneGuard Monorepo Implementation Board"
Cohesion: 0.08
Nodes (25): Accepted manual release follow-ups, CaneGuard Monorepo Implementation Board, Existing user work preserved, Phase 0 baseline, Phase 1 foundation, Phase 1 verification, Phase 2 report API and storage, Phase 2 verification (+17 more)

### Community 36 - "ApiFormRequest"
Cohesion: 0.15
Nodes (5): ApiFormRequest, MobileLoginRequest, MobileSessionRequest, Illuminate\Contracts\Validation\Validator, Illuminate\Foundation\Http\FormRequest

### Community 49 - "ApiDashboardRepository.ts"
Cohesion: 0.22
Nodes (10): ApiDashboardRepository, mapDashboard(), mapReportListItem(), DashboardResponseDto, dashboardResponseSchema, reportListItemSchema, DashboardRepository, MockDashboardRepository (+2 more)

### Community 52 - "Illuminate\Http\Request"
Cohesion: 0.30
Nodes (5): AuthenticatedUserResource, ReportListResource, ReportStatusResource, Illuminate\Http\Request, Illuminate\Http\Resources\Json\JsonResource

### Community 57 - "TestCase"
Cohesion: 0.05
Nodes (21): DatabaseSeeder, ReportSeeder, DemoUserSeederTest, ExampleTest, HealthEndpointTest, LocationReferenceTest, ReportSchemaAndSeederTest, SanctumInstallationTest (+13 more)

### Community 58 - "User"
Cohesion: 0.12
Nodes (4): User, MobileAuthenticationTest, MobileReportStatusTest, Illuminate\Foundation\Auth\User

### Community 59 - "StoreReport"
Cohesion: 0.13
Nodes (8): PersistReport, StoreReport, SecureReportImages, HealthController, Illuminate\Console\Command, Illuminate\Filesystem\FilesystemAdapter, Illuminate\Http\UploadedFile, Throwable

### Community 61 - "axiosClient.ts"
Cohesion: 0.22
Nodes (9): toApiError(), createAxiosClient(), notifySessionExpired(), AppEnv, env, envSchema, parseEnv(), reportListItemDto (+1 more)

### Community 62 - "AkiDev tool routing"
Cohesion: 0.40
Nodes (4): AkiDev tool routing, Choose the smallest sufficient path, Explicit mobile intent gate and device ownership, Shared prerequisite policy

### Community 67 - "ReportController.php"
Cohesion: 0.21
Nodes (4): QueryReports, ReportController, ListReportsRequest, Illuminate\Contracts\Pagination\LengthAwarePaginator

### Community 68 - "MobileReportStatusController.php"
Cohesion: 0.32
Nodes (3): MobileReportStatusController, ReportStatusesRequest, Illuminate\Http\Resources\Json\AnonymousResourceCollection

### Community 69 - "AuthProvider.tsx"
Cohesion: 0.10
Nodes (28): App(), AppProviders(), queryClient, AppRouter(), getCurrentUser(), initializeCsrf(), isWebRole(), loginRequest() (+20 more)

### Community 71 - "SubmittedReportsPage.tsx"
Cohesion: 0.12
Nodes (20): Button(), ButtonProps, ButtonVariant, SearchInput(), SearchInputProps, SelectFilter(), SelectFilterProps, TextArea() (+12 more)

### Community 72 - "ReportResource"
Cohesion: 0.28
Nodes (3): ReviewReportController, ReviewReportRequest, ReportResource

### Community 74 - "router.tsx"
Cohesion: 0.22
Nodes (13): routes, RequireAuth(), useAuth(), AppHeader(), initials(), AppShell(), AppSidebar(), futureLinks (+5 more)

### Community 75 - "DashboardPage.tsx"
Cohesion: 0.26
Nodes (6): SecondaryMetric(), MetricCard(), useDashboard(), DashboardPage(), formatRefreshTime(), summary

### Community 77 - "Reviewer Operating Manual"
Cohesion: 0.09
Nodes (22): API review, Completion criteria, Correctness review, Critical, Database review, Expo / mobile review, Finding format, Frontend review (+14 more)

### Community 78 - "ReportPolicy"
Cohesion: 0.15
Nodes (3): ReportPolicy, AppServiceProvider, Illuminate\Support\ServiceProvider

### Community 79 - "report.schema.ts"
Cohesion: 0.21
Nodes (11): paginationLinksSchema, paginationMetaSchema, userSchema, authorityClassifiedConditionSchema, diseaseKeySchema, ReportDetailDto, reportDetailSchema, ReportListItemDto (+3 more)

### Community 80 - "Controller"
Cohesion: 0.26
Nodes (6): LocationReferenceController, ReportImageController, Controller, Illuminate\Foundation\Auth\Access\AuthorizesRequests, Illuminate\Http\Response, Symfony\Component\HttpFoundation\StreamedResponse

### Community 82 - "useReports.ts"
Cohesion: 0.29
Nodes (10): reportKeys, reportQueryOptions(), reportsQueryOptions(), dashboardKeys, useReport(), useReports(), useUpdateReportReview(), dashboardRepository (+2 more)

### Community 83 - "report.types.ts"
Cohesion: 0.13
Nodes (19): answerLabels, SymptomResponseItem(), commonSymptoms, mockReports, AuthorityClassifiedCondition, LocationSource, PaginatedReports, ReportFilters (+11 more)

### Community 85 - "Graph Mapper Operating Manual"
Cohesion: 0.09
Nodes (21): Boundaries and ownership, Change blast radius, Change blast radius, Cross-cutting behavior, Data flow, Dependencies, Entry points, Evidence notes (+13 more)

### Community 87 - "CaseReviewPage.test.tsx"
Cohesion: 0.30
Nodes (4): reportDetailResponseSchema, report, paginatedReportsDto, reportDetailDto

### Community 88 - "Illuminate\Http\JsonResponse"
Cohesion: 0.31
Nodes (3): MobileAuthController, LogoutController, Illuminate\Http\JsonResponse

### Community 89 - "Pagination.tsx"
Cohesion: 0.60
Nodes (3): Pagination(), PaginationProps, visiblePages()

### Community 92 - "Implementer Operating Manual"
Cohesion: 0.10
Nodes (19): API implementation, Before editing, Completion criteria, Correctness checklist, Database changes, Dependencies, Expo / React Native implementation, Failure recovery (+11 more)

### Community 101 - "Project Context"
Cohesion: 0.17
Nodes (11): Architecture, Constraints, Current priorities, External contracts, Important conventions, Known debt or limitations, Project Context, Purpose (+3 more)

### Community 105 - "Maestro Runtime Verification"
Cohesion: 0.20
Nodes (9): Core rule, Decision, Maestro Runtime Verification, Misleading-failure protection, Native-runtime freshness assessment, Reporting, Runtime stale, unknown, or rebuild required, Runtime usable (+1 more)

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
- **446 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User` connect `User` to `Illuminate\Database\Eloquent\Relations\HasMany`, `UserFactory`, `ReportApiTest`, `MobileReportUploadTest`, `ReportPolicy`, `MobileReportSecurityContractMySqlTest`, `Illuminate\Http\JsonResponse`, `TestCase`, `StoreReport`, `WebAuthenticationTest`, `Report`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `Report` connect `Report` to `Illuminate\Database\Eloquent\Relations\HasMany`, `ReportController.php`, `MobileReportStatusController.php`, `Illuminate\Database\Eloquent\Relations\BelongsTo`, `ReportResource`, `api.php`, `UserFactory`, `ReportApiTest`, `MobileReportUploadTest`, `DashboardSummaryController.php`, `ReportPolicy`, `Controller`, `MobileReportSecurityContractMySqlTest`, `TestCase`, `User`, `StoreReport`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `TestCase` connect `TestCase` to `ReportMySqlSchemaTest`, `MobileReportUploadTest`, `MobileReportSecurityContractMySqlTest`, `Report`, `User`, `ReportApiTest`, `WebAuthenticationTest`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 77 inferred relationships involving `User` (e.g. with `.login()` and `.definition()`) actually correct?**
  _`User` has 77 INFERRED edges - model-reasoned connections that need verification._
- **Are the 54 inferred relationships involving `Report` (e.g. with `.handle()` and `.handle()`) actually correct?**
  _`Report` has 54 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orchestrator Operating Manual` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._