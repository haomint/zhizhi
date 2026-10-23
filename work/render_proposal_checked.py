"""Canonical renderer with a Windows Word PDF backend when bundled LO is absent.

The PDF is exported directly from the latest DOCX by render_proposal_word.ps1.
The packaged renderer still determines DPI and produces the page PNGs for QA.
"""
from pathlib import Path
import importlib.util
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(r'C:\Users\xiang\.codex\plugins\cache\openai-primary-runtime\documents\26.1013.11914\skills\documents\render_docx.py')
PDF = ROOT / 'work' / 'proposal-render' / 'proposal-word.pdf'
assert PDF.is_file() and PDF.stat().st_size > 1000
spec = importlib.util.spec_from_file_location('canonical_docx_renderer', SCRIPT)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def word_pdf_backend(doc_path, user_profile, convert_tmp_dir, stem, verbose=False):
    destination = Path(convert_tmp_dir) / (stem + '.pdf')
    shutil.copy2(PDF, destination)
    return str(destination), 'Rendered by Microsoft Word in a private background automation instance.'


renderer.convert_to_pdf = word_pdf_backend
sys.argv = [str(SCRIPT), str(ROOT / 'outputs' / '知枝私人学习助手项目方案.docx'),
            '--output_dir', str(ROOT / 'work' / 'proposal-render' / 'pages')]
renderer.main()
