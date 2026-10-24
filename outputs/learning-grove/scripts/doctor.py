"""Compatibility launcher for the TypeScript engineering checks."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
subprocess.run(['node', 'scripts/doctor.ts'], cwd=root, check=True)
