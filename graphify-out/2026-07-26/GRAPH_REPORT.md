# Graph Report - caneguard-web  (2026-07-26)

## Corpus Check
- 99 files · ~28,185 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 530 nodes · 647 edges · 54 communities (48 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ec569eb5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Plan and Agent Governance
- Plan Manifest Metadata
- Page Layout Components
- Shared UI Controls
- Frontend Dependencies
- Browser TypeScript Config
- Report Data Workflow
- NPM Project Config
- Tooling TypeScript Config
- Application Routing Shell
- Frontend Architecture Docs
- Social Icon Assets
- Vite Brand Asset
- Layered Hero Illustration
- Favicon Brand Asset
- React Brand Asset
- TypeScript Project References
- Harness Sync Docs
- HTML Application Shell
- User Type Model
- Official References
- composer.json
- scripts
- User
- devDependencies
- HealthController
- README.md
- Phase 0 baseline
- AppServiceProvider

## God Nodes (most connected - your core abstractions)
1. `Release Notes` - 43 edges
2. `documents` - 21 edges
3. `CaneGuard Web Monorepo Implementation Plan` - 20 edges
4. `compilerOptions` - 18 edges
5. `scripts` - 15 edges
6. `compilerOptions` - 15 edges
7. `DiseaseReport` - 13 edges
8. `User` - 10 edges
9. `scripts` - 9 edges
10. `require-dev` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Mock Report Review Workflow` --semantically_similar_to--> `Submitted Reports to Case Review Workflow`  [INFERRED] [semantically similar]
  README.md → docs/CaneGuard_Frontend_Implementation_Plan_Design_System.md
- `Repository Restructure and Migration Plan` --references--> `Core Agent Rules`  [EXTRACTED]
  docs/CaneGuard_Web_Monorepo_Laravel_MySQL_Plan_v4/03_REPOSITORY_RESTRUCTURE_AND_MIGRATION_PLAN.md → AGENTS.md
- `Master Definition of Done` --conceptually_related_to--> `Verification and Reporting`  [INFERRED]
  docs/CaneGuard_Web_Monorepo_Laravel_MySQL_Plan_v4/18_MASTER_DEFINITION_OF_DONE.md → AGENTS.md
- `Backend-Neutral Architecture` --semantically_similar_to--> `Page Query Repository Axios Laravel Boundary`  [INFERRED] [semantically similar]
  docs/CaneGuard_Frontend_Implementation_Plan_Design_System.md → docs/CaneGuard_Web_Monorepo_Laravel_MySQL_Plan_v4/10_PHASE_3_WEB_API_INFRASTRUCTURE.md
- `Release Demo Flow` --semantically_similar_to--> `Tuesday Persistence Demo`  [INFERRED] [semantically similar]
  docs/CaneGuard_Web_Monorepo_Laravel_MySQL_Plan_v4/16_PHASE_9_TESTING_DEMO_AND_RELEASE.md → docs/CaneGuard_Web_Monorepo_Laravel_MySQL_Plan_v4/00_START_HERE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Monorepo Application Boundary** — docs_caneguard_web_monorepo_laravel_mysql_plan_v4_00_start_here_single_repository_model, docs_caneguard_web_monorepo_laravel_mysql_plan_v4_01_monorepo_architecture_and_directory_rules_react_root_laravel_api_boundary, docs_caneguard_web_monorepo_laravel_mysql_plan_v4_03_repository_restructure_and_migration_plan_repository_restructure_and_migration_plan [INFERRED 0.95]
- **Frontend Data Boundary** — docs_caneguard_frontend_implementation_plan_design_system_backend_neutral_architecture, docs_caneguard_frontend_implementation_plan_design_system_reports_repository_contract, docs_caneguard_web_monorepo_laravel_mysql_plan_v4_10_phase_3_web_api_infrastructure_page_query_repository_axios_laravel_boundary [INFERRED 0.95]
- **Persistent Report Review Flow** — docs_caneguard_frontend_implementation_plan_design_system_submitted_reports_case_review_workflow, docs_caneguard_web_monorepo_laravel_mysql_plan_v4_14_phase_7_report_detail_image_and_review_review_persistence_and_invalidation, docs_caneguard_web_monorepo_laravel_mysql_plan_v4_16_phase_9_testing_demo_and_release_release_demo_flow [INFERRED 0.95]
- **Favicon Brand Mark Composition** — public_favicon_brand_mark, public_favicon_lightning_silhouette, public_favicon_masked_glow, public_favicon_blur_filters [INFERRED 0.95]
- **Social Platform Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_x_icon [INFERRED 0.95]
- **React Atomic Symbol Composition** — src_assets_react_logo, src_assets_react_atomic_orbits, src_assets_react_central_nucleus, src_assets_react_cyan_brand_color [INFERRED 0.95]
- **Vite Visual Identity Composition** — src_assets_vite_lightning_bolt, src_assets_vite_parentheses, src_assets_vite_glow_effect [INFERRED 0.95]

## Communities (54 total, 6 thin omitted)

### Community 0 - "Plan and Agent Governance"
Cohesion: 0.08
Nodes (34): Core Agent Rules, Graphify-First Codebase Workflow, Progressive Context, Task Risk Workflows, Verification and Reporting, CaneGuard Web Monorepo Implementation Plan, Single Repository Model, Tuesday Persistence Demo (+26 more)

### Community 1 - "Plan Manifest Metadata"
Cohesion: 0.06
Nodes (30): api_location, backend, database, documents, mobile_implementation_included, project, repository, repository_model (+22 more)

### Community 2 - "Page Layout Components"
Cohesion: 0.08
Nodes (33): DetailField(), PageContent(), PageHeader(), ConfidenceDisplay(), MetricCard(), answerLabels, SymptomResponseItem(), Button() (+25 more)

### Community 3 - "Shared UI Controls"
Cohesion: 0.05
Nodes (43): Release Notes, [Unreleased](https://github.com/laravel/laravel/compare/v13.7.0...13.x), [v12.0.0 (2025-??-??)](https://github.com/laravel/laravel/compare/v11.0.2...v12.0.0), [v12.0.10](https://github.com/laravel/laravel/compare/v12.0.9...v12.0.10) - 2025-06-09, [v12.0.11](https://github.com/laravel/laravel/compare/v12.0.10...v12.0.11) - 2025-06-10, [v12.0.1](https://github.com/laravel/laravel/compare/v12.0.0...v12.0.1) - 2025-02-24, [v12.0.2](https://github.com/laravel/laravel/compare/v12.0.1...v12.0.2) - 2025-03-04, [v12.0.3](https://github.com/laravel/laravel/compare/v12.0.2...v12.0.3) - 2025-03-17 (+35 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (25): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+17 more)

### Community 5 - "Browser TypeScript Config"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 6 - "Report Data Workflow"
Cohesion: 0.13
Nodes (21): EvidenceThumbnail(), DiseaseBadge(), ReviewStatusBadge(), ReportTable(), ReportsRepository, commonSymptoms, mockReports, cloneReport() (+13 more)

### Community 7 - "NPM Project Config"
Cohesion: 0.06
Nodes (32): lucide-react, dependencies, lucide-react, react, react-dom, react-router, tailwindcss, @tailwindcss/vite (+24 more)

### Community 8 - "Tooling TypeScript Config"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 9 - "Application Routing Shell"
Cohesion: 0.20
Nodes (9): App(), AppRouter(), routes, AppHeader(), AppShell(), AppSidebar(), futureLinks, NotFoundPage() (+1 more)

### Community 10 - "Frontend Architecture Docs"
Cohesion: 0.25
Nodes (8): Backend-Neutral Architecture, CaneGuard Web Frontend Implementation Plan, Decision-Support Terminology, Reports Repository Contract, Submitted Reports to Case Review Workflow, Page Query Repository Axios Laravel Boundary, CaneGuard Web, Mock Report Review Workflow

### Community 11 - "Social Icon Assets"
Cohesion: 0.46
Nodes (8): Bluesky Icon Clip Path, Bluesky Icon, Discord Icon, Documentation and Code Icon, GitHub Icon, Social and Navigation Icon Sprite, Social Profile Icon, X Social Network Icon

### Community 12 - "Vite Brand Asset"
Cohesion: 0.38
Nodes (7): Accessible Vite Title, Vite, Dark Mode Color Adaptation, Purple and Cyan Glow Effect, Purple Lightning Bolt, Vite Logo, Adaptive Parentheses

### Community 13 - "Layered Hero Illustration"
Cohesion: 0.50
Nodes (5): Layered Platform Illustration, Layered System Architecture, Lower Purple Layer, Upper Floating Layer, Vertical Separation Guides

### Community 14 - "Favicon Brand Asset"
Cohesion: 0.67
Nodes (4): Gaussian Blur Filter Set, Purple Lightning Bolt Brand Mark, Angular Lightning Silhouette, Masked Multicolor Glow

### Community 15 - "React Brand Asset"
Cohesion: 0.67
Nodes (4): Three Intersecting Atomic Orbits, Central Circular Nucleus, React Cyan Brand Color, React Logo

### Community 23 - "composer.json"
Cohesion: 0.05
Nodes (41): pestphp/pest-plugin, php-http/discovery, autoload, autoload-dev, psr-4, psr-4, config, allow-plugins (+33 more)

### Community 24 - "scripts"
Cohesion: 0.08
Nodes (26): scripts, dev, post-autoload-dump, post-create-project-cmd, post-root-package-install, post-update-cmd, pre-package-uninstall, setup (+18 more)

### Community 25 - "User"
Cohesion: 0.13
Nodes (12): User, UserFactory, DatabaseSeeder, Illuminate\Database\Console\Seeds\WithoutModelEvents, Illuminate\Database\Eloquent\Concerns\HasUuids, Illuminate\Database\Eloquent\Factories\Factory, Illuminate\Database\Eloquent\Factories\HasFactory, Illuminate\Database\Seeder (+4 more)

### Community 26 - "devDependencies"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, laravel-vite-plugin, tailwindcss, @tailwindcss/vite, vite, tailwindcss, @tailwindcss/vite (+9 more)

### Community 27 - "HealthController"
Cohesion: 0.33
Nodes (3): HealthController, Controller, Illuminate\Http\JsonResponse

### Community 28 - "README.md"
Cohesion: 0.25
Nodes (7): About Laravel, Agentic Development, Code of Conduct, Contributing, Learning Laravel, License, Security Vulnerabilities

### Community 29 - "Phase 0 baseline"
Cohesion: 0.22
Nodes (8): CaneGuard Monorepo Implementation Board, Existing user work preserved, Phase 0 baseline, Phase 1 foundation, Phase 1 verification, Phase cards, Tool baseline, Web baseline checks

## Knowledge Gaps
- **249 isolated node(s):** `$schema`, `name`, `type`, `description`, `laravel` (+244 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `scripts` to `composer.json`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Frontend Dependencies` to `NPM Project Config`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `$schema`, `name`, `type` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Plan and Agent Governance` be split into smaller, more focused modules?**
  _Cohesion score 0.0766488413547237 - nodes in this community are weakly interconnected._
- **Should `Plan Manifest Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Page Layout Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07632850241545894 - nodes in this community are weakly interconnected._
- **Should `Shared UI Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
