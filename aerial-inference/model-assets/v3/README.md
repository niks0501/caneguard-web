# CaneGuard Aerial SegFormer-B1 V3 checkpoint

This directory contains the original artifacts from the trained CaneGuard Aerial V3 experiment:

- `model.safetensors` — trained weights (54,738,404 bytes)
- `config.json` — model architecture and three-class label mapping
- `preprocessor_config.json` — saved image preprocessing configuration
- `caneguard_v3_metadata.json` — experiment metadata
- `weights.sha256` — original checkpoint integrity checksum

The trained weights **are committed and present** in this branch as an ordinary Git blob, not a Git LFS pointer. No Git LFS installation is required to check out the current checkpoint. The file is larger than GitHub's recommended 50 MB file-size threshold, which may trigger a warning and increases repository history size. Do not rewrite branch history or change storage format without reviewing the impact on collaborators.

To verify the checkpoint after checkout, run this command from the model-assets directory:

```bash
sha256sum -c weights.sha256
```

Expected SHA-256 for `model.safetensors`:
`95bb131f37dd0e5b123342f98e4b0e59f4529e179bf6e0591485dfd6ae5f4b2f`

Original archived checkpoint:
https://drive.google.com/file/d/1T2JxKAyw2WGdzqQAywKghGv4_5RQU8ho/view

## Integration scope

These files are model assets, **not a working inference service**. The Laravel API, React panel, queue worker, protected storage and optional Python service still require implementation. Keep the aerial feature disabled by default and independent of mobile sync, report review and monitoring.

The model outputs `background`, `normal_looking_canopy`, and `visibly_abnormal_canopy` labels. Visible abnormal-canopy percentage is experimental and must not be treated as surveyed ground-area percentage, confirmed disease severity, affected hectares, yield loss, or economic loss.
