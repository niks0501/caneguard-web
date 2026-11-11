#!/usr/bin/env python3
"""One-shot CaneGuard Aerial V3 segmentation.

Reads one photo, runs the exported ONNX model and writes a class-index mask PNG
(0 background, 1 normal_looking_canopy, 2 visibly_abnormal_canopy). Prints one
JSON object on stdout and exits non-zero with a message on stderr on any error.
Preprocessing mirrors model-assets/v3/preprocessor_config.json.
"""
import argparse
import hashlib
import json
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

INPUT_SIZE = 512
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
MASK_LONG_SIDE = 2048
Image.MAX_IMAGE_PIXELS = 150_000_000


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preprocess(image):
    resized = image.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    array = np.asarray(resized, dtype=np.float32) / 255.0
    array = (array - MEAN) / STD
    return np.ascontiguousarray(array.transpose(2, 0, 1)[None])


def upsample(logits, size):
    width, height = size
    planes = [
        np.asarray(Image.fromarray(plane, mode="F").resize(size, Image.BILINEAR))
        for plane in logits
    ]
    stacked = np.stack(planes)
    assert stacked.shape == (logits.shape[0], height, width)
    return stacked


def mask_size(width, height):
    scale = min(1.0, MASK_LONG_SIDE / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def shares(mask):
    total = mask.size
    normal = int(np.count_nonzero(mask == 1))
    abnormal = int(np.count_nonzero(mask == 2))
    canopy = normal + abnormal
    coverage = round(canopy * 100 / total, 2)
    if canopy == 0:
        return 0.0, 0.0, coverage
    normal_percent = round(normal * 100 / canopy, 2)
    return normal_percent, round(100 - normal_percent, 2), coverage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--mask-out", required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()

    model_sha = sha256_of(args.model)
    if model_sha != args.sha256.lower():
        raise SystemExit("model SHA-256 does not match the pinned value")

    started = time.perf_counter()
    with Image.open(args.image) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size

    options = ort.SessionOptions()
    options.enable_cpu_mem_arena = False
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(
        args.model, options, providers=["CPUExecutionProvider"]
    )
    logits = session.run(None, {session.get_inputs()[0].name: preprocess(image)})[0][0]

    mask = upsample(logits, mask_size(width, height)).argmax(axis=0).astype(np.uint8)
    Image.fromarray(mask, mode="L").save(args.mask_out, format="PNG")

    normal, abnormal, coverage = shares(mask)
    print(
        json.dumps(
            {
                "image_width": width,
                "image_height": height,
                "mask_width": int(mask.shape[1]),
                "mask_height": int(mask.shape[0]),
                "normal_canopy_percent": normal,
                "abnormal_canopy_percent": abnormal,
                "canopy_coverage_percent": coverage,
                "model_sha256": model_sha,
                "inference_ms": round((time.perf_counter() - started) * 1000),
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - one-shot CLI reports and exits
        print(f"segment failed: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
