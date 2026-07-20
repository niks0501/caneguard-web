# CaneGuard Web Frontend Implementation Plan

**Project:** CaneGuard Web Dashboard  
**Current phase:** Backend-neutral frontend prototype  
**Primary users:** Authorized Municipal Agriculture Office personnel and other agricultural personnel, subject to stakeholder validation  
**Development approach:** React + TypeScript + Vite + Tailwind CSS, using mock data only

---

## 1. Purpose of This Frontend Task

The purpose of the current frontend work is to create a stable visual and structural foundation for the CaneGuard web dashboard before the team makes a final backend decision between Firebase and Laravel.

The frontend must remain usable with either backend. React components must not directly depend on Firebase, Laravel, Firestore, MySQL, or any API-specific implementation. The first prototype will use local mock data and clearly separated domain types.

The attached mockups will serve as the visual reference. The work should adopt their design system, layout behavior, component language, and overall visual character rather than reproduce every screen immediately.

---

## 2. Main Outcome for Today

By the end of the session, the project should contain:

- A working React + TypeScript + Vite project
- Tailwind CSS configured through the Vite plugin
- React Router configured
- A backend-neutral folder structure
- CaneGuard design tokens and global styles
- A reusable desktop dashboard shell
- A reusable sidebar and top navigation
- Shared buttons, cards, badges, filters, and table styles
- Realistic mock report data
- A functional Submitted Reports page
- A functional Case Review page connected through React Router
- Basic loading, empty, and error-state components
- A clean initial Git commit ready to push to GitHub

The Dashboard Overview, Barangay Monitoring map, and Analytics screens are not required for today's first implementation.

---

## 3. Frontend Technology Stack

### Required now

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide React
- Local mock TypeScript data
- Native React state for current prototype interactions

### Deliberately postponed

- Firebase SDK
- Laravel API integration
- TanStack Query
- Axios
- Recharts
- Leaflet or React Leaflet
- Real authentication
- Cloud image uploads
- Offline synchronization
- PDF and CSV generation

These tools should only be added when the feature that requires them is ready.

---

## 4. Backend-Neutral Architecture

The visual components should not know where the data comes from.

```text
React pages and components
        ↓
Frontend report service or repository contract
        ↓
Mock report implementation for now
        ↓
Firebase or Laravel implementation later
```

A future backend change should affect the data layer more than the UI layer.

Example contract:

```ts
export interface ReportsRepository {
  listReports(filters?: ReportFilters): Promise<DiseaseReport[]>;
  getReportById(reportId: string): Promise<DiseaseReport | null>;
  updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport>;
}
```

For the first prototype, a `MockReportsRepository` may read and update data stored in memory.

---

## 5. Design Direction From the Mockups

The attached screens establish a consistent CaneGuard administrative design language. The project should preserve the following qualities.

### 5.1 Visual character

- Calm, professional, and agriculture-oriented
- Modern but not overly technical
- Muted rather than highly saturated
- Spacious desktop layout
- Clear visual hierarchy
- Rounded surfaces with subtle borders and shadows
- Data-heavy content presented in an approachable way

The dashboard should feel like an official monitoring workspace, not a marketing website or a generic admin template.

### 5.2 Typography

Use two complementary type styles:

- **Headings and major numeric values:** Georgia or another readable serif
- **Body text, labels, controls, and tables:** Inter or a system sans-serif stack

Suggested implementation:

```css
--font-heading: Georgia, "Times New Roman", serif;
--font-body: Inter, ui-sans-serif, system-ui, sans-serif;
```

Serif typography should be limited to page titles, section headings, and prominent metrics. Forms, navigation, tables, and supporting text should remain sans-serif for readability.

### 5.3 Core color tokens

The web design should remain aligned with the existing CaneGuard mobile design system.

```css
--color-primary: #445d48;
--color-primary-dark: #2e4031;
--color-primary-light: #6e8b74;

--color-accent: #d6cc99;
--color-accent-dark: #b8ad73;

--color-page: #f3f7f3;
--color-surface: #ffffff;
--color-surface-soft: #eef3ee;

--color-text: #1f2a21;
--color-muted: #6b7280;
--color-border: #dde5de;
```

Disease colors may follow the existing mobile tokens:

```css
--disease-healthy: #2e7d32;
--disease-downy: #1e88e5;
--disease-smut: #7b2cbf;
--disease-mosaic: #f9a825;
--disease-rust: #d35400;
--disease-unclear: #37474f;
```

Color must not be the only way that meaning is communicated. Every disease, status, or action must also include a readable text label.

### 5.4 Shape and elevation

- Cards should use medium-to-large corner radii
- Buttons should use rounded rectangles, not fully circular pills
- Status and disease badges may use pill shapes
- Borders should remain light and subtle
- Shadows should be soft and limited to major surfaces
- Avoid gradients, glossy effects, neon colors, and excessive animation

Suggested radius scale:

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 18px;
--radius-xl: 24px;
```

### 5.5 Desktop layout system

The main authenticated dashboard should use:

```text
Fixed or sticky left sidebar
        +
Top application header
        +
Scrollable page content
```

Recommended proportions:

- Sidebar: approximately 240 to 260 pixels
- Header: approximately 72 to 82 pixels
- Main content maximum width: fluid desktop layout
- Page padding: 24 to 32 pixels
- Content grid: 12-column responsive grid where useful

The sidebar should contain the CaneGuard identity, grouped navigation, sync information, and user profile. The top header should contain the current page title, supporting context, search, and account controls.

### 5.6 Responsive behavior

The first version is desktop-first because the intended office users will primarily access it through desktops or laptops.

However:

- The layout should remain usable on tablets
- The sidebar should collapse below the desktop breakpoint
- Wide report tables may use horizontal scrolling on smaller screens
- Content cards should stack instead of becoming cramped
- Critical buttons and filters must remain accessible

The web dashboard is not a duplicate of the mobile application. It should adapt the same design identity to administrative desktop tasks.

---

## 6. Terminology and Responsible Interface Language

The interface must reflect CaneGuard's role as a decision-support system.

### Use

- Submitted reports
- Possible disease
- Model confidence
- Needs review
- Acknowledged
- Needs field verification
- Insufficient evidence
- Closed
- Submitted observations
- Reports by barangay

### Avoid unless supported by a formal expert process

- Confirmed disease
- Disease diagnosis
- Validated case
- Infected barangay
- Critical area
- Exact affected plants
- Disease prevalence
- Confirmed outbreak

The attached design may use labels such as **Validated** and **Case validation**. The visual badge style may be retained, but the wording should be revised to **Case review** or **Needs field verification** until the office confirms a formal validation procedure.

The map and analytics should summarize submitted reports, not claim complete disease prevalence.

---

## 7. Screens Selected for the First Frontend Slice

The attached mockups show a broader system, but today's implementation should focus on one complete workflow.

```text
Submitted Reports
        ↓
Open a selected report
        ↓
Case Review
        ↓
Record a mock review action
        ↓
Return to the updated report list
```

### 7.1 Submitted Reports page

This will be the primary work queue.

Required elements:

- Page heading and supporting text
- Search field
- Status filter
- Disease filter
- Barangay filter
- Date-range placeholder
- Sort control
- Responsive report table
- Disease badges
- Review-status badges
- Mock pagination
- Empty-state behavior
- Clear action for opening a report

Suggested table fields:

- Report ID
- Evidence thumbnail
- Possible disease
- Model confidence
- Submitted by
- Barangay or location
- Capture date
- Submission date
- Review status
- Action menu

### 7.2 Case Review page

This page should prioritize evidence before decision.

Required sections:

- Report title and current review status
- Submitted image placeholder
- Possible disease and model confidence
- Capture source and synchronization status
- Guided symptom responses
- Submission details
- Field note
- Decision-support reminder
- Review notes
- Review action buttons
- Back-to-reports navigation

The model result and the office review result must be visually separated.

---

## 8. Shared Components to Build

### Layout

- `AppShell`
- `AppSidebar`
- `AppHeader`
- `PageHeader`
- `PageContent`

### Navigation

- `SidebarSection`
- `SidebarLink`
- `MobileNavigationDrawer`
- `UserProfileSummary`

### Data display

- `MetricCard`
- `ReportTable`
- `ReportRow`
- `EvidenceThumbnail`
- `DiseaseBadge`
- `ReviewStatusBadge`
- `ConfidenceDisplay`
- `DetailField`
- `SymptomResponseItem`

### Controls

- `Button`
- `IconButton`
- `SearchInput`
- `SelectFilter`
- `FilterBar`
- `TextArea`
- `Pagination`

### System states

- `LoadingState`
- `EmptyState`
- `ErrorState`
- `NoResultsState`
- `ImagePendingState`

The components should use a small number of controlled variants rather than one-off styling in every page.

---

## 9. Suggested Folder Structure

```text
caneguard-web/
├── public/
├── src/
│   ├── app/
│   │   ├── router.tsx
│   │   └── routes.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── reports/
│   │   └── ui/
│   ├── data/
│   │   ├── contracts/
│   │   │   └── ReportsRepository.ts
│   │   └── mock/
│   │       ├── mockReports.ts
│   │       └── MockReportsRepository.ts
│   ├── domain/
│   │   ├── report.types.ts
│   │   ├── review.types.ts
│   │   └── user.types.ts
│   ├── pages/
│   │   ├── SubmittedReportsPage.tsx
│   │   ├── CaseReviewPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── services/
│   │   └── reports.service.ts
│   ├── styles/
│   │   ├── index.css
│   │   └── tokens.css
│   ├── App.tsx
│   └── main.tsx
├── docs/
│   └── FRONTEND_IMPLEMENTATION_PLAN.md
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Do not create empty Firebase or Laravel folders yet. Add a backend adapter only after the stack decision is made.

---

## 10. Domain Model for Mock Data

```ts
export type DiseaseKey =
  | "healthy"
  | "downy_mildew"
  | "smut"
  | "mosaic"
  | "rust"
  | "unclear";

export type ReviewStatus =
  | "pending_review"
  | "acknowledged"
  | "needs_field_verification"
  | "insufficient_evidence"
  | "closed";

export type SubmitterRole =
  | "farmer"
  | "field_inspector"
  | "agricultural_personnel";

export interface SymptomResponse {
  id: string;
  label: string;
  answer: "yes" | "no" | "not_sure";
}

export interface DiseaseReport {
  id: string;
  barangay: string;
  farmReference?: string;

  submittedByName: string;
  submitterRole: SubmitterRole;

  capturedAt: string;
  submittedAt: string;

  predictedDisease: DiseaseKey;
  confidence: number;

  imageUrl?: string;
  imageStatus: "available" | "pending_sync" | "unavailable";

  symptoms: SymptomResponse[];
  fieldNotes?: string;

  reviewStatus: ReviewStatus;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}
```

The mock records should include different diseases, barangays, confidence values, submitter roles, image states, and review statuses. Avoid using mock labels that imply expert confirmation.

---

## 11. Manual Local Project Setup

### 11.1 Prerequisites

Install and verify:

```bash
node --version
npm --version
git --version
```

Use a current Node.js version supported by the current Vite release.

### 11.2 Create the parent folder

On Windows PowerShell:

```powershell
cd $HOME\Documents
mkdir CaneGuard
cd CaneGuard
```

On Git Bash, macOS, or Linux:

```bash
cd ~/Documents
mkdir -p CaneGuard
cd CaneGuard
```

### 11.3 Create the React TypeScript project

```bash
npm create vite@latest caneguard-web -- --template react-ts
cd caneguard-web
npm install
```

### 11.4 Install the initial frontend dependencies

```bash
npm install react-router lucide-react
npm install tailwindcss @tailwindcss/vite
```

Do not install Firebase, Laravel packages, TanStack Query, charts, or maps yet.

### 11.5 Configure Tailwind CSS

Update `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

Replace the content of `src/index.css` with:

```css
@import "tailwindcss";
```

The CaneGuard tokens and global typography rules may then be added below the import or placed in `src/styles/tokens.css`.

### 11.6 Start the development server

```bash
npm run dev
```

Open the local address shown in the terminal.

### 11.7 Verify the project

```bash
npm run lint
npm run build
```

Both commands should complete without errors before the first push.

---

## 12. Manual Git and GitHub Setup

### 12.1 Initialize Git locally

From the project root:

```bash
git init -b main
git status
```

### 12.2 Configure your identity when needed

```bash
git config user.name "Nikko"
git config user.email "nikkocausapin61@gmail.com"
```

To apply the identity to all future repositories, add `--global`.

### 12.3 Create the GitHub repository manually

On GitHub:

1. Select **New repository**.
2. Use the repository name `caneguard-web`.
3. Add a short description.
4. Choose public or private visibility.
5. Do not initialize it with a README, `.gitignore`, or license because the Vite project already contains files.
6. Create the repository.
7. Copy the HTTPS repository URL.

### 12.4 Commit the local project

```bash
git add .
git commit -m "chore: initialize CaneGuard web frontend"
```

### 12.5 Link the local project to GitHub

```bash
git remote add origin https://github.com/niks0501/caneguard-web.git
git remote -v
git push -u origin main
```

Never commit passwords, private keys, service-account files, or real environment secrets.

---

## 13. Implementation Sequence for Today

### Phase 1: Project cleanup and routing

- Remove the default Vite demonstration UI
- Configure React Router
- Create routes for `/reports` and `/reports/:reportId`
- Add a temporary redirect from `/` to `/reports`
- Add a not-found page

### Phase 2: CaneGuard visual foundation

- Add design tokens
- Apply page, surface, text, border, and primary colors
- Configure heading and body typography
- Add global focus states
- Establish button, input, card, badge, and table patterns

### Phase 3: Dashboard shell

- Build the sidebar
- Build the header
- Build page-title and content containers
- Add responsive sidebar behavior
- Add placeholder user and sync-information sections

### Phase 4: Domain types and mock data

- Define the report types
- Create six to ten realistic mock reports
- Create lookup helpers for diseases and statuses
- Build the mock repository or simple service

### Phase 5: Submitted Reports page

- Build the filter bar
- Build the report table
- Add client-side search and filtering
- Add disease and status badges
- Link each row to the case-review route
- Add empty and no-results states

### Phase 6: Case Review page

- Read the report ID from the route
- Display the report evidence and metadata
- Display guided symptom responses
- Separate the AI result from the MAO review
- Add mock review notes and action controls
- Return to the report list after saving a mock review

### Phase 7: Quality pass

- Check layout at desktop and tablet widths
- Confirm keyboard focus visibility
- Check table readability
- Confirm labels do not exaggerate AI results
- Run lint and production build
- Commit the completed frontend slice

---

## 14. Suggested Commit Sequence

```text
chore: initialize React TypeScript frontend
style: add CaneGuard design tokens and global styles
feat: add dashboard shell and navigation
feat: add report domain types and mock data
feat: build submitted reports page
feat: build case review workflow
fix: improve responsive and accessibility states
docs: add frontend implementation plan
```

Small commits make it easier to identify and reverse mistakes.

---

## 15. Acceptance Criteria

The first frontend slice is complete when:

- The application starts using `npm run dev`
- The project builds using `npm run build`
- The layout visibly follows the attached CaneGuard system design
- The sidebar, header, cards, badges, filters, and tables feel consistent
- Users can view mock reports
- Users can search and filter reports
- Users can open a report
- Users can view the submitted evidence and symptom responses
- Users can record a mock review action
- The AI-supported result remains separate from the office review
- Empty, no-results, missing-image, and error states are represented
- No Firebase or Laravel dependency appears in page components
- No interface wording claims confirmed prevalence or diagnosis

---

## 16. Out of Scope for Today

The following work should wait:

- Final login and authorization
- Firebase or Laravel integration
- Real mobile synchronization
- Real image storage
- Full dashboard analytics
- Official map boundaries
- Heat maps
- CSV and PDF generation
- Notifications
- Administrative user management
- Audit logs
- Final MAO review workflow
- All additional screens shown in the concept set

The current goal is a strong, reusable frontend foundation and one complete report-review journey.

---

## 17. Decisions Pending Stakeholder Feedback

The follow-up interview may change:

- Primary dashboard owner
- MAO, SRA, mill-inspector, or shared user roles
- Report-review terminology
- Required report fields
- Review statuses
- Escalation and assignment workflow
- Privacy requirements
- Map usefulness
- Export format
- Need for formal validation
- Need for on-premise deployment

These changes should refine the system rather than block the current frontend foundation.

---

## 18. Final Direction

Proceed with a backend-neutral React frontend.

Use the attached mockups as a design-system reference, not as a requirement to implement every screen immediately. Build the shared visual language and the Submitted Reports to Case Review workflow first. Keep the code modular so Firebase or Laravel can be connected later without redesigning the interface.
