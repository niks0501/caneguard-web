# Graph Report - caneguard-web  (2026-08-13)

## Corpus Check
- 245 files · ~140,047 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1477 nodes · 2340 edges · 152 communities (120 shown, 32 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 127 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `72df6b86`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Agent Rules
- Orchestrator Operating Manual
- report.schema.ts
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
- AdapterGenerationTests
- CaneGuard Document Shell
- user.types.ts
- Architecture Operating Manual
- api/composer.json
- scripts
- Report
- devDependencies
- DashboardSummaryController.php
- api/README.md
- CaneGuard Monorepo Implementation Board
- api/artisan
- Illuminate\Http\JsonResponse
- ApiFormRequest
- Illuminate\Foundation\Application
- Illuminate\Http\Request
- TestCase
- User
- StoreReport
- router.tsx
- ReleaseDemoFlowMySqlTest
- SecureReportImages
- SubmittedReportsPage.tsx
- ExampleTest
- ReportMySqlSchemaTest
- ReportController.php
- MobileReportStatusController.php
- AuthProvider.tsx
- AuthenticatedUserRequest
- axiosClient.ts
- ReviewReportController.php
- StoreMobileReportRequest
- DashboardPage.tsx
- ApiError.ts
- MobileReportUploadTest
- Reviewer Operating Manual
- AppServiceProvider.php
- DatabaseSeeder.php
- Controller
- report.types.ts
- reportListUrlState.ts
- run_hook
- Graph Mapper Operating Manual
- assets/README.md
- HealthEndpointTest
- ApiDashboardRepository.ts
- Pagination.tsx
- useReports.ts
- Implementer Operating Manual
- RunManagerTests
- SyncHarnessTests
- nextjs/package.json
- react-vite/package.json
- ProjectCheckTests
- scripts
- CommandPolicyTests
- expo/package.json
- Project Context
- CommandFailurePathTests
- ModelProfileValidationTests
- PolicyProviderTests
- Maestro Runtime Verification
- laravel/composer.json
- DetectProjectTests
- require-dev
- setup
- ProjectMigrationTests
- ProjectRuntimeTests
- config
- Project Verification Commands
- SubmittedReportsPage.test.tsx
- Engineering
- Illuminate\Database\Eloquent\Relations\HasMany
- Project Stack Guide — Laravel + React
- Security
- Plan Feature
- Ship Feature
- Verification
- psr-4
- require
- Graph Map
- Quick Fix
- Review Feature
- post-create-project-cmd
- Mobile report review status contract
- Database Review
- Security Review
- extra
- ModelEvalTests
- backend.md
- context-efficiency.md
- database.md
- deployment.md
- frontend.md
- rules/review.md
- testing.md
- CaneGuard Web

## God Nodes (most connected - your core abstractions)
1. `User` - 84 edges
2. `Report` - 72 edges
3. `Release Notes` - 43 edges
4. `TestCase` - 33 edges
5. `Controller` - 24 edges
6. `Orchestrator Operating Manual` - 20 edges
7. `Architecture Operating Manual` - 19 edges
8. `Implementer Operating Manual` - 19 edges
9. `scripts` - 18 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)
- `mapDashboard()` --indirect_call--> `mapReportListItem()`  [INFERRED]
  src/data/api/mappers/dashboard.mapper.ts → src/data/api/mappers/report.mapper.ts
- `ReportListUrlState` --references--> `ReportFilters`  [EXTRACTED]
  src/pages/reportListUrlState.ts → src/domain/report.types.ts
- `AuthenticatedUserController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/AuthenticatedUserController.php → api/app/Http/Controllers/Controller.php
- `DashboardSummaryController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/DashboardSummaryController.php → api/app/Http/Controllers/Controller.php
- `MobileAuthController` --inherits--> `Controller`  [EXTRACTED]
  api/app/Http/Controllers/Api/V1/MobileAuthController.php → api/app/Http/Controllers/Controller.php

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Favicon Brand Mark Composition** — public_favicon_brand_mark, public_favicon_lightning_silhouette, public_favicon_masked_glow, public_favicon_blur_filters [INFERRED 0.95]
- **Social Platform Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_x_icon [INFERRED 0.95]
- **React Atomic Symbol Composition** — src_assets_react_logo, src_assets_react_atomic_orbits, src_assets_react_central_nucleus, src_assets_react_cyan_brand_color [INFERRED 0.95]
- **Vite Visual Identity Composition** — src_assets_vite_lightning_bolt, src_assets_vite_parentheses, src_assets_vite_glow_effect [INFERRED 0.95]

## Communities (152 total, 32 thin omitted)

### Community 0 - "Core Agent Rules"
Cohesion: 0.40
Nodes (5): Core Agent Rules, Graphify-First Codebase Workflow, Progressive Context, Task Risk Workflows, Verification and Reporting

### Community 1 - "Orchestrator Operating Manual"
Cohesion: 0.06
Nodes (31): Architecture, Autonomous execution loop, Completion criteria, Context strategy, Core principles, Database policy, Delegation model, Dependency policy (+23 more)

### Community 2 - "report.schema.ts"
Cohesion: 0.13
Nodes (19): toQueryParams(), humanize(), mapPaginationMeta(), mapReportDetail(), mapReportListItem(), paginationLinksSchema, paginationMetaSchema, userSchema (+11 more)

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
Cohesion: 0.23
Nodes (5): ReportClassScore, ReportQualityWarning, ReportSymptom, Illuminate\Database\Eloquent\Model, Illuminate\Database\Eloquent\Relations\BelongsTo

### Community 7 - "scripts"
Cohesion: 0.05
Nodes (41): axios, lucide-react, dependencies, axios, lucide-react, react, react-dom, react-router (+33 more)

### Community 8 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "CaseReviewPage.tsx"
Cohesion: 0.15
Nodes (20): DashboardRecentReports(), ConfidenceDisplay(), EvidenceThumbnail(), DiseaseBadge(), ReviewStatusBadge(), ReportTable(), answerLabels, SymptomResponseItem() (+12 more)

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

### Community 17 - "AdapterGenerationTests"
Cohesion: 0.09
Nodes (5): AdapterGenerationTests, CanonicalContractSchemaTests, ExecutionProfileTests, load_module(), Path

### Community 20 - "Architecture Operating Manual"
Cohesion: 0.07
Nodes (29): API design, Architecture Operating Manual, Assumptions, Confirmed facts, Contracts and data, Current flow, Data design, Expo / React Native guidance (+21 more)

### Community 23 - "api/composer.json"
Cohesion: 0.14
Nodes (13): autoload-dev, psr-4, description, keywords, license, minimum-stability, name, prefer-stable (+5 more)

### Community 24 - "scripts"
Cohesion: 0.14
Nodes (14): @php artisan test, scripts, dev, post-autoload-dump, post-update-cmd, pre-package-uninstall, test, Composer\\Config::disableProcessTimeout (+6 more)

### Community 25 - "Report"
Cohesion: 0.08
Nodes (5): Report, ReportApiTest, ReviewReportTest, SecureReportImagesCommandTest, MobileReportSecurityContractMySqlTest

### Community 26 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, @tailwindcss/vite (+9 more)

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
Cohesion: 0.20
Nodes (5): LoginController, ApiFormRequest, LoginRequest, Illuminate\Contracts\Validation\Validator, Illuminate\Foundation\Http\FormRequest

### Community 52 - "Illuminate\Http\Request"
Cohesion: 0.26
Nodes (5): ReportListResource, ReportResource, ReportStatusResource, Illuminate\Http\Request, Illuminate\Http\Resources\Json\JsonResource

### Community 57 - "TestCase"
Cohesion: 0.14
Nodes (10): DemoUserSeederTest, ExampleTest, ReportSchemaAndSeederTest, SanctumInstallationTest, TestCase, Illuminate\Database\Eloquent\Concerns\HasUuids, Illuminate\Database\Eloquent\Factories\HasFactory, Illuminate\Foundation\Testing\DatabaseTransactions (+2 more)

### Community 58 - "User"
Cohesion: 0.07
Nodes (8): User, ReportPolicy, MobileAuthenticationTest, MobileReportStatusTest, WebAuthenticationTest, Illuminate\Foundation\Auth\User, Illuminate\Notifications\Notifiable, Laravel\Sanctum\HasApiTokens

### Community 59 - "StoreReport"
Cohesion: 0.28
Nodes (4): PersistReport, StoreReport, Illuminate\Http\UploadedFile, Throwable

### Community 60 - "router.tsx"
Cohesion: 0.20
Nodes (14): routes, RequireAuth(), useAuth(), AppHeader(), initials(), AppShell(), AppSidebar(), futureLinks (+6 more)

### Community 62 - "SecureReportImages"
Cohesion: 0.47
Nodes (3): SecureReportImages, Illuminate\Console\Command, Illuminate\Filesystem\FilesystemAdapter

### Community 63 - "SubmittedReportsPage.tsx"
Cohesion: 0.12
Nodes (19): Button(), ButtonProps, ButtonVariant, SearchInput(), SearchInputProps, SelectFilter(), SelectFilterProps, TextArea() (+11 more)

### Community 67 - "ReportController.php"
Cohesion: 0.23
Nodes (4): QueryReports, ReportController, ListReportsRequest, Illuminate\Contracts\Pagination\LengthAwarePaginator

### Community 68 - "MobileReportStatusController.php"
Cohesion: 0.32
Nodes (3): MobileReportStatusController, ReportStatusesRequest, Illuminate\Http\Resources\Json\AnonymousResourceCollection

### Community 69 - "AuthProvider.tsx"
Cohesion: 0.12
Nodes (25): App(), AppProviders(), queryClient, AppRouter(), getCurrentUser(), initializeCsrf(), isWebRole(), loginRequest() (+17 more)

### Community 70 - "AuthenticatedUserRequest"
Cohesion: 0.24
Nodes (3): AuthenticatedUserController, AuthenticatedUserRequest, AuthenticatedUserResource

### Community 71 - "axiosClient.ts"
Cohesion: 0.14
Nodes (14): toApiError(), axiosClient, createAxiosClient(), webUser, listeners, notifySessionExpired(), SessionExpiredListener, AppEnv (+6 more)

### Community 74 - "DashboardPage.tsx"
Cohesion: 0.19
Nodes (9): SecondaryMetric(), DetailField(), PageContent(), PageHeader(), MetricCard(), useDashboard(), DashboardPage(), formatRefreshTime() (+1 more)

### Community 75 - "ApiError.ts"
Cohesion: 0.21
Nodes (10): ApiError, errorPayloadSchema, createQueryClient(), isTransientServerError(), shouldRetryQuery(), ServerStatus(), ServerStatusValue, queryClient() (+2 more)

### Community 77 - "Reviewer Operating Manual"
Cohesion: 0.09
Nodes (22): API review, Completion criteria, Correctness review, Critical, Database review, Expo / mobile review, Finding format, Frontend review (+14 more)

### Community 79 - "DatabaseSeeder.php"
Cohesion: 0.36
Nodes (4): DatabaseSeeder, ReportSeeder, Illuminate\Database\Console\Seeds\WithoutModelEvents, Illuminate\Database\Seeder

### Community 80 - "Controller"
Cohesion: 0.24
Nodes (5): HealthController, ReportImageController, Controller, Illuminate\Foundation\Auth\Access\AuthorizesRequests, Symfony\Component\HttpFoundation\StreamedResponse

### Community 82 - "report.types.ts"
Cohesion: 0.23
Nodes (9): ApiReportsRepository, sortValues, ReportsRepository, cloneReport(), MockReportsRepository, DiseaseReport, PaginatedReports, ReportFilters (+1 more)

### Community 83 - "reportListUrlState.ts"
Cohesion: 0.24
Nodes (9): DiseaseKey, dateSchema, diseaseSchema, optionalValue(), parseReportListUrl(), reportListPageSize, ReportListUrlState, sortSchema (+1 more)

### Community 84 - "run_hook"
Cohesion: 0.16
Nodes (6): CompletedProcess, CodexLifecycleHookTests, CodexPostToolUseHookTests, CodexPreToolUseHookTests, load_hook(), run_hook()

### Community 85 - "Graph Mapper Operating Manual"
Cohesion: 0.09
Nodes (21): Boundaries and ownership, Change blast radius, Change blast radius, Cross-cutting behavior, Data flow, Dependencies, Entry points, Evidence notes (+13 more)

### Community 88 - "ApiDashboardRepository.ts"
Cohesion: 0.23
Nodes (10): ApiDashboardRepository, mapDashboard(), DashboardResponseDto, dashboardResponseSchema, reportListItemSchema, DashboardRepository, MockDashboardRepository, DashboardSummary (+2 more)

### Community 89 - "Pagination.tsx"
Cohesion: 0.60
Nodes (3): Pagination(), PaginationProps, visiblePages()

### Community 91 - "useReports.ts"
Cohesion: 0.19
Nodes (12): reportKeys, reportQueryOptions(), reportsQueryOptions(), dashboardKeys, useReport(), useReports(), useUpdateReportReview(), CaseReviewPage() (+4 more)

### Community 92 - "Implementer Operating Manual"
Cohesion: 0.10
Nodes (19): API implementation, Before editing, Completion criteria, Correctness checklist, Database changes, Dependencies, Expo / React Native implementation, Failure recovery (+11 more)

### Community 93 - "RunManagerTests"
Cohesion: 0.16
Nodes (3): load_module(), Path, RunManagerTests

### Community 95 - "nextjs/package.json"
Cohesion: 0.14
Nodes (13): next, dependencies, next, react, devDependencies, typescript, react, typescript (+5 more)

### Community 96 - "react-vite/package.json"
Cohesion: 0.14
Nodes (13): dependencies, react, devDependencies, typescript, vite, react, typescript, vite (+5 more)

### Community 98 - "scripts"
Cohesion: 0.15
Nodes (12): express, dependencies, express, devDependencies, typescript, typescript, name, scripts (+4 more)

### Community 99 - "CommandPolicyTests"
Cohesion: 0.22
Nodes (3): CommandPolicyTests, load_module(), Path

### Community 100 - "expo/package.json"
Cohesion: 0.17
Nodes (11): expo, react-native, dependencies, expo, react-native, devDependencies, typescript, typescript (+3 more)

### Community 101 - "Project Context"
Cohesion: 0.17
Nodes (11): Architecture, Constraints, Current priorities, External contracts, Important conventions, Known debt or limitations, Project Context, Purpose (+3 more)

### Community 103 - "ModelProfileValidationTests"
Cohesion: 0.29
Nodes (3): ModelProfileRenderingTests, ModelProfileValidationTests, Path

### Community 105 - "Maestro Runtime Verification"
Cohesion: 0.20
Nodes (9): Core rule, Decision, Maestro Runtime Verification, Misleading-failure protection, Native-runtime freshness assessment, Reporting, Runtime stale, unknown, or rebuild required, Runtime usable (+1 more)

### Community 106 - "laravel/composer.json"
Cohesion: 0.20
Nodes (9): @php artisan test, name, require, require-dev, laravel/pint, pestphp/pest, laravel/framework, scripts (+1 more)

### Community 108 - "require-dev"
Cohesion: 0.25
Nodes (8): require-dev, fakerphp/faker, laravel/pail, laravel/pao, laravel/pint, mockery/mockery, nunomaduro/collision, phpunit/phpunit

### Community 109 - "setup"
Cohesion: 0.25
Nodes (8): post-root-package-install, setup, composer install, npm install --ignore-scripts, npm run build, @php artisan key:generate, @php artisan migrate --force, @php -r \"file_exists('.env') || copy('.env.example', '.env');\

### Community 110 - "ProjectMigrationTests"
Cohesion: 0.39
Nodes (3): load_module(), ProjectMigrationTests, Path

### Community 111 - "ProjectRuntimeTests"
Cohesion: 0.39
Nodes (3): load_module(), ProjectRuntimeTests, Path

### Community 112 - "config"
Cohesion: 0.29
Nodes (7): pestphp/pest-plugin, php-http/discovery, config, allow-plugins, optimize-autoloader, preferred-install, sort-packages

### Community 113 - "Project Verification Commands"
Cohesion: 0.29
Nodes (6): Broader checks, Database checks, Fast checks, Manual verification, Project Verification Commands, Rules

### Community 114 - "SubmittedReportsPage.test.tsx"
Cohesion: 0.33
Nodes (3): commonSymptoms, mockReports, pageData

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

### Community 122 - "psr-4"
Cohesion: 0.40
Nodes (5): autoload, psr-4, App\\, Database\\Factories\\, Database\\Seeders\\

### Community 123 - "require"
Cohesion: 0.40
Nodes (5): require, laravel/framework, laravel/sanctum, laravel/tinker, php

### Community 124 - "Graph Map"
Cohesion: 0.50
Nodes (3): Graph Map, Graphify, Map

### Community 125 - "Quick Fix"
Cohesion: 0.50
Nodes (3): Escalate when, Quick Fix, Workflow

### Community 126 - "Review Feature"
Cohesion: 0.50
Nodes (3): Finding quality, Review Feature, Review priority

### Community 127 - "post-create-project-cmd"
Cohesion: 0.50
Nodes (4): post-create-project-cmd, @php artisan key:generate --ansi, @php artisan migrate --graceful --ansi, @php -r \"file_exists('database/database.sqlite') || touch('database/database.sqlite');\

### Community 128 - "Mobile report review status contract"
Cohesion: 0.50
Nodes (3): Mobile report review status contract, Read status snapshots, Review mutation and retry behavior

### Community 131 - "extra"
Cohesion: 0.67
Nodes (3): extra, laravel, dont-discover

## Knowledge Gaps
- **458 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+453 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User` connect `User` to `Illuminate\Http\JsonResponse`, `UserFactory`, `MobileReportUploadTest`, `AppServiceProvider.php`, `DatabaseSeeder.php`, `Illuminate\Database\Eloquent\Relations\HasMany`, `TestCase`, `StoreReport`, `ReleaseDemoFlowMySqlTest`, `Report`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `Report` connect `Report` to `ReportController.php`, `MobileReportStatusController.php`, `Illuminate\Database\Eloquent\Relations\BelongsTo`, `ReviewReportController.php`, `StoreReport`, `StoreMobileReportRequest`, `UserFactory`, `MobileReportUploadTest`, `AppServiceProvider.php`, `DatabaseSeeder.php`, `Controller`, `Illuminate\Http\Request`, `Illuminate\Database\Eloquent\Relations\HasMany`, `TestCase`, `User`, `DashboardSummaryController.php`, `ReleaseDemoFlowMySqlTest`, `SecureReportImages`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `TestCase` connect `TestCase` to `ReportMySqlSchemaTest`, `MobileReportUploadTest`, `Illuminate\Foundation\Application`, `HealthEndpointTest`, `Report`, `User`, `ReleaseDemoFlowMySqlTest`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `User` (e.g. with `.login()` and `.definition()`) actually correct?**
  _`User` has 61 INFERRED edges - model-reasoned connections that need verification._
- **Are the 44 inferred relationships involving `Report` (e.g. with `.handle()` and `.handle()`) actually correct?**
  _`Report` has 44 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _458 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orchestrator Operating Manual` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._