# CaneGuard Aerial V3 — Field-image acceptance fixtures

Five **unmodified image files** copied from your CaneGuard Google Drive folder:
`03_AERIAL_COLLECTED / SOURCE_001_Arial_Scanning`.

These are real aerial field views, not AI-generated imagery. However, **the source camera files, photographer permissions, exact crop health, and training/test split are unverified**. They may be frame captures rather than original camera photos. Original filenames in Drive end in `.PNG`, but some stored bytes are JPEG. The package uses file extensions matching the actual image encoding.

## Important publication and research limitations

- **Redistribution permission is not established.** Do not publish these files in your public GitHub repository unless you have authorization from the photographer or source rights holder. Use them locally or in a private repository until permission is confirmed.
- Because these files came from the CaneGuard aerial-image collection, they may overlap with V3 training or validation data. **Do not use them as independent model-accuracy evidence** without a documented split and duplicate check.
- No manually annotated canopy masks or verified disease/health labels are provided. The descriptions are visual testing categories, not agricultural diagnoses.
- All five source images have EXIF orientation 1 (normal) or equivalent metadata. The extra file `optional_derived_test/orientation_flag_6_derived.jpg` is deliberately altered for an EXIF rotation handling test. It is **not** one of the five source images.
- Keep these files out of official case submissions, production databases, or economic-loss calculations unless the source and scope are validated.

## Suggested functional test

Upload each image in the **development/staging** CaneGuard web interface. Check upload, progress/error states, V3 inference, segmentation mask/overlay, canopy percentages, result persistence, and authorization. Include the separately labeled orientation test.

A passing result establishes functional integration only. Compare predicted masks against independently annotated ground truth on held-out fields before making an accuracy claim.

## File provenance

| File | Original file | Description | Source URL |
|---|---|---|---|
| `01_dense_canopy_rows.jpg` | `2026-10-14-15-31-13-713.PNG` | Distinct rows and fairly uniform-looking canopy; not verified healthy | https://drive.google.com/file/d/1Cj4vek1MZuOZlmC1xD8MSHH-IjYBWjRg/view |
| `02_variable_canopy_rows.jpg` | `2026-10-14-16-33-25-895.PNG` | Rows with visible variation in canopy density or color; not verified disease | https://drive.google.com/file/d/1fBTuZgW0nZT-tg7AHRHog6v9Sk_cMoMX/view |
| `03_irregular_canopy_pattern.png` | `2026-10-15-12-25-51-976.PNG` | Dense field with irregular lighter/darker canopy patches; not verified abnormal | https://drive.google.com/file/d/1AFLyPIesY8HrmpORzBlfZ-b8g7qN7LHC/view |
| `04_partial_canopy_background.png` | `2026-10-14-16-15-13-603.PNG` | Roads, trees, buildings and some cane canopy; background-exclusion stress test | https://drive.google.com/file/d/10_sCJb8OGbKaACQfHaAJCvL0LSsWtGOH/view |
| `05_farm_plot_context.jpg` | `2026-10-15-12-29-15-054.PNG` | Wider field context with bordering trees and buildings; not verified coverage of entire plot | https://drive.google.com/file/d/1K8Us6Lznh1f5BOdCjPjtnqG8nSyk62i5/view |

## Integrity

`SHA256SUMS.txt` lists the original hashes of the five unchanged source images and the separately derived EXIF test. If you upload the set to GitHub after confirming rights, upload the **individual extracted files** rather than the ZIP alone so your coding agent can inspect them.
