# CaneGuard brand masters

This directory contains the captain-delivered SVG masters and the derived dark colourway shared between CaneGuard Mobile and CaneGuard Web.
The SVGs are design masters; web-consumed exports live under `public/` and `src/assets/brand/`.

## Provenance

- Author: **TODO — captain to provide**
- Licence: **TODO — captain to provide**
- Original creation/delivery date: **TODO — captain to provide**

## Palette

| Role | On-light | On-dark |
| --- | --- | --- |
| Structural green | `#074424` | `#91B79A` |
| Green | `#3E7C30` | `#3E7C30` |
| Lime | `#81A92A` | `#81A92A` |
| Gold | `#BB941D` | `#E2A15F` |
| Cream | `#F0E4B8` | `#F0E4B8` |
| Dark field | — | `#101711` |

The on-dark variant changes only the structural green and gold. All exports are sRGB.

*Theme deviation note:* Functional UI tokens in `src/styles/tokens.css` (`--color-primary: #2d6b40`, `--color-primary-dark: #1e452a`) remain calibrated for web WCAG AA contrast against light surfaces rather than raw mark fills (`#074424` and `#3E7C30`).

## Geometry and clear space

- The lockup master is a 1000×1000 SVG. Artwork bounds are `38 18 920 939`.
- The mark is paths 1–5 with bounds `177 18 646 736`; the wordmark is paths 6–7.
- Keep at least one mark-height of clear space around the full lockup.
- Use the simplified favicon mark at small sizes; icon-only artwork should not be used below 24–32 px.
- Dense working surfaces (case review body, tables, maps) deliberately exclude brand chrome to preserve data density.

## Web asset map

- `brand/CaneGuard_logo_flat.svg`: 1000×1000 vector stacked lockup master.
- `brand/CaneGuard_logo_flat_onDark.svg`: 1000×1000 vector on-dark stacked lockup master.
- `brand/CaneGuard_favicon_mark.svg`: 1000×1000 vector simplified one-colour mark master.
- `brand/CaneGuard_logo_flat_preview.png`: 1000×1000 reference preview image.
- `public/favicon.svg`: Browser tab vector favicon (simplified mark).
- `public/favicon.png`: 196×196 browser tab raster favicon.
- `public/apple-touch-icon.png`: 1024×1024 opaque dark-field launcher icon.
- `src/assets/brand/cane_guard_logo.png`: 829×829 transparent on-light mark.
- `src/assets/brand/cane_guard_logo_onDark.png`: 829×829 transparent on-dark mark.
- `src/assets/brand/cane_guard_wordmark.png`: 1024×256 transparent wordmark export.
- `src/assets/brand/CaneGuard_logo_flat.svg`: Vector stacked lockup for web UI.
- `src/assets/brand/CaneGuard_logo_flat_onDark.svg`: Vector on-dark stacked lockup for web UI.
- `src/assets/brand/CaneGuard_favicon_mark.svg`: Vector simplified mark for web UI.
