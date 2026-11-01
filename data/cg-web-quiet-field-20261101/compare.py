#!/usr/bin/env python3
"""QF-2 reconciliation check.

Re-derives every contrast ratio in report.md from inputs.json, checks that
every colour-bearing token in src/styles/tokens.css has a recorded status,
and checks that tokens sharing one role keep one value.

Run from anywhere: python3 data/cg-web-quiet-field-20261101/compare.py
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = json.loads((HERE / "inputs.json").read_text())

failures = []


def lum(hex_value):
    h = hex_value.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

    def channel(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def check(label, foreground, background, minimum):
    value = ratio(foreground, background)
    passed = value >= minimum
    print(f"{'PASS' if passed else 'FAIL'} {label:44} {value:5.2f}:1  (>= {minimum})")
    if not passed:
        failures.append(f"{label} is {value:.2f}:1, below {minimum}:1")
    return value


roles = DATA["final"]["roles"]
draft = DATA["web_draft"]
mobile = DATA["mobile"]

print("== role-to-token binding ==")
recorded = DATA["tokens"]
css = (ROOT / "src/styles/tokens.css").read_text()
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
COLOUR_VALUE = re.compile(r"#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(", re.I)
COLOUR_NAME = re.compile(
    r"^--(?:color|brand|disease|badge|login-page-mint)-|^--kpi-band-[1-4]$"
)
declared = {
    name: value.strip()
    for name, value in re.findall(r"(--[a-z0-9-]+)\s*:\s*([^;]+);", css)
    if COLOUR_NAME.search(name) or COLOUR_VALUE.search(value)
}
missing = sorted(set(declared) - set(recorded))
if missing:
    failures.append(f"colour tokens with no recorded status: {missing}")
print(f"{'PASS' if not missing else 'FAIL'} every colour-bearing token in tokens.css is recorded"
      f" ({len(declared)} declared, {len(recorded)} recorded)")
if missing:
    print(f"     missing: {', '.join(missing)}")

binding_failures = []
role_bearing = 0
for name, entry in sorted(recorded.items()):
    role = entry.get("role")
    if not role:
        continue
    role_bearing += 1
    want = roles[role]
    if entry["light"].lower() != want["light"].lower():
        binding_failures.append(f"{name} light {entry['light']} != role {role} light {want['light']}")
    if want["dark"] is not None and entry.get("dark", "").lower() != want["dark"].lower():
        binding_failures.append(f"{name} dark {entry.get('dark')} != role {role} dark {want['dark']}")
failures.extend(binding_failures)
print(f"{'PASS' if not binding_failures else 'FAIL'} every role-bearing token matches its final role"
      f" ({role_bearing} bound)")

for group in DATA["duplicate_groups"]:
    lights = {recorded[name]["light"].lower() for name in group}
    darks = {recorded[name].get("dark", "").lower() for name in group}
    label = " and ".join(group)
    ok = len(lights) == 1 and (len(darks) == 1 or darks == {""})
    print(f"{'PASS' if ok else 'FAIL'} shared value: {label}")
    if not ok:
        failures.append(f"{label} split across {lights}")

print("\n== mobile and web draft inputs ==")
check("flat ink on mobile page", roles["ink"]["light"], mobile["page"], 4.5)
check("mobile secondary on mobile page", mobile["secondary_text"], mobile["page"], 4.5)
check("mobile note pair", mobile["note_fg"], mobile["note_tint"], 4.5)
check("mobile stop pair", mobile["stop_fg"], mobile["stop_tint"], 4.5)
check("retired draft: ink on draft page", roles["ink"]["light"], draft["page"]["paper"], 4.5)
check("retired draft: draft secondary on draft page", draft["secondary_text"]["paper"], draft["page"]["paper"], 4.5)
check("retired draft: note pair", draft["note_fg"]["paper"], draft["note_tint"]["paper"], 4.5)
check("retired draft: stop pair", draft["stop_fg"]["paper"], draft["stop_tint"]["paper"], 4.5)

print("\n== final paper set ==")
check("ink on page", roles["ink"]["light"], roles["page"]["light"], 4.5)
check("ink on surface", roles["ink"]["light"], roles["surface"]["light"], 4.5)
check("ink on soft surface", roles["ink"]["light"], roles["soft_surface"]["light"], 4.5)
check("secondary text on page", roles["secondary_text"]["light"], roles["page"]["light"], 4.5)
check("secondary text on surface", roles["secondary_text"]["light"], roles["surface"]["light"], 4.5)
check("secondary text on soft surface", roles["secondary_text"]["light"], roles["soft_surface"]["light"], 4.5)
check("note pair", roles["note_fg"]["light"], roles["note_tint"]["light"], 4.5)
check("stop pair", roles["stop_fg"]["light"], roles["stop_tint"]["light"], 4.5)
check("primary ink on page", roles["primary_ink"]["light"], roles["page"]["light"], 4.5)
check("page as sidebar text on primary ink", roles["page"]["light"], roles["primary_ink"]["light"], 4.5)

bands = [roles[name]["light"] for name in DATA["final"]["chart_band_order"]]
for i, fill in enumerate(bands):
    check(f"chart band {i + 1} on surface", fill, roles["surface"]["light"], 3)
for i, fill in enumerate(bands):
    neighbour = bands[(i + 1) % len(bands)]
    check(f"chart band {i + 1} vs {((i + 1) % len(bands)) + 1}", fill, neighbour, 3)

print("\n== final dark set ==")
check("dark ink on dark page", roles["ink"]["dark"], roles["page"]["dark"], 4.5)
check("dark ink on dark surface", roles["ink"]["dark"], roles["surface"]["dark"], 4.5)
check("dark ink on dark soft surface", roles["ink"]["dark"], roles["soft_surface"]["dark"], 4.5)
check("dark secondary on dark page", roles["secondary_text"]["dark"], roles["page"]["dark"], 4.5)
check("dark secondary on dark surface", roles["secondary_text"]["dark"], roles["surface"]["dark"], 4.5)
check("dark note pair", roles["note_fg"]["dark"], roles["note_tint"]["dark"], 4.5)
check("dark stop pair", roles["stop_fg"]["dark"], roles["stop_tint"]["dark"], 4.5)

shipped_ink_on_dark = ratio(roles["ink"]["light"], roles["page"]["dark"])
why_dark_ink = shipped_ink_on_dark < 4.5
print(f"{'PASS' if why_dark_ink else 'FAIL'} shipped ink on dark page is why dark ink is set"
      f" {shipped_ink_on_dark:5.2f}:1  (< 4.5)")
if not why_dark_ink:
    failures.append("shipped ink on dark page now passes; the dark ink derivation is unexplained")

print()
if failures:
    print("RESULT: FAILURES")
    for item in failures:
        print(f" - {item}")
    sys.exit(1)

print("RESULT: ALL CHECKS PASS")
