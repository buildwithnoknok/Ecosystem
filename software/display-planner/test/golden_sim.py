# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
"""
Golden-test helper: run a planner-generated Python snippet through the REAL noknok.py
on a desktop Python, against brain-Pico/tools/display_sim.py's virtual module, and
print the resulting frame as hex (4 hex digits of RGB565 per pixel, one line per row).
test/golden.mjs compares that with render.js's own frame.

    python golden_sim.py <snippet.py> <width> <height> [image_dir]

`image_dir` (optional) is prepended to sys.path so the sim runs from anywhere; the
snippet's image paths are absolute already (the test passes imageDir).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPOS = os.environ.get("NOKNOK_REPOS", os.path.abspath(os.path.join(HERE, "..", "..", "..", "..")))
sys.path.insert(0, os.path.join(REPOS, "brain-Pico", "tools"))
sys.path.insert(0, os.path.join(REPOS, "brain-Pico", "software"))

from display_sim import make_display   # noqa: E402  (stubs the CircuitPython modules)

snippet, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
d, panel = make_display(w, h)
with open(snippet, "r", encoding="utf-8") as f:
    code = f.read()
exec(compile(code, snippet, "exec"), {"d": d})
if panel.last_err:
    sys.stderr.write("module error byte: %d\n" % panel.last_err)
for row in panel.px:
    sys.stdout.write("".join("%04x" % c for c in row) + "\n")
