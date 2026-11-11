#!/usr/bin/env python3
"""One-time dev-machine export of the V3 checkpoint to ONNX.

Needs torch, transformers, safetensors, onnx, onnxruntime, numpy and Pillow
(not installed on the server). Verifies the committed weights SHA-256, exports
logits-only at the 512x512 training size, asserts parity with PyTorch and
writes model.onnx.sha256 next to this script. Stage the .onnx on the server;
it is not committed.

    python export_onnx.py --out /path/to/model.onnx
"""
import argparse
import hashlib
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from transformers import SegformerForSemanticSegmentation

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "model-assets" / "v3"
MAX_LOGIT_DIFF = 1e-3


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Logits(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixel_values):
        return self.model(pixel_values=pixel_values).logits


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    expected = (ASSETS / "weights.sha256").read_text().split()[0]
    if sha256_of(ASSETS / "model.safetensors") != expected:
        raise SystemExit("model.safetensors does not match weights.sha256")

    model = SegformerForSemanticSegmentation.from_pretrained(ASSETS, attn_implementation="eager").eval()
    wrapper = Logits(model)
    sample = torch.randn(1, 3, 512, 512)
    with torch.no_grad():
        reference = wrapper(sample).numpy()
    torch.onnx.export(
        wrapper,
        (sample,),
        args.out,
        input_names=["pixel_values"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
    )

    session = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    exported = session.run(None, {"pixel_values": sample.numpy()})[0]
    diff = float(np.abs(reference - exported).max())
    if diff > MAX_LOGIT_DIFF or not (reference.argmax(1) == exported.argmax(1)).all():
        raise SystemExit(f"ONNX parity failed (max logit diff {diff})")

    digest = sha256_of(args.out)
    (HERE / "model.onnx.sha256").write_text(f"{digest}  model.onnx\n")
    print(f"exported {args.out} sha256={digest} max_logit_diff={diff:.2e}")


if __name__ == "__main__":
    main()
