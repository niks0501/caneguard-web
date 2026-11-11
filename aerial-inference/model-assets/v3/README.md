# CaneGuard Aerial SegFormer-B1 V3 checkpoint

The following original checkpoint artifacts were saved from the completed V3 experiment:

- `config.json`
- `preprocessor_config.json`
- `caneguard_v3_metadata.json`

The original trained weights are required but **not yet committed**:

- `model.safetensors` (54,738,404 bytes)
- SHA-256: `95bb131f37dd0e5b123342f98e4b0e59f4529e179bf6e0591485dfd6ae5f4b2f`
- Source: https://drive.google.com/file/d/1T2JxKAyw2WGdzqQAywKghGv4_5RQU8ho/view

To finish the asset handoff, download the exact original file, place it beside the JSON files, verify its SHA-256, and commit it with Git LFS. Do not recreate or retrain the weights.

The checkpoint is not integrated into Laravel or the React dashboard. The aerial experiment must be behind a server-enforced, disabled-by-default feature flag. Its visible abnormal-canopy percentage must not be treated as surveyed ground-area percentage or yield loss.
