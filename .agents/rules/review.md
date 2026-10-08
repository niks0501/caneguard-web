# Review

Review against the request, acceptance criteria, repository contracts, and observable behavior.

Prioritize:
1. requirement gaps;
2. correctness defects;
3. security and data integrity;
4. compatibility regressions;
5. error and edge-case behavior;
6. missing meaningful tests;
7. unfalsifiable or implementation-mirroring tests;
8. performance issues with plausible impact;
9. maintainability problems that materially raise future defect risk.

Do not report subjective style preferences as defects when they follow project conventions.

For each test, ask:
- Which requested behavior does it prove?
- Would it fail on regression?
- Are mocks hiding the claimed behavior?

Report tests that are unfalsifiable or mirror implementation as findings.

Every finding should identify:
- severity;
- affected area;
- realistic failure scenario;
- evidence;
- smallest reasonable correction.

When there are no actionable findings, say so explicitly and list any residual verification gaps.
