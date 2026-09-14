"""Compatibility wrapper for the shared resumable Qwen model setup."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SHARED = ROOT.parents[2] / "Pipelines/audio/qwen/voice.py"
args = [sys.executable, str(SHARED), "setup", "--download", *sys.argv[1:]]
raise SystemExit(subprocess.call(args, cwd=ROOT, env=os.environ.copy()))
