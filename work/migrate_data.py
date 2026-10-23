from pathlib import Path
import sqlite3

source = Path(r'C:\Users\xiang\Documents\Codex\2026-10-15\x-z\outputs\learning-grove\data\grove.sqlite3')
target = Path(__file__).resolve().parents[1] / 'outputs' / 'learning-grove' / 'data' / 'grove.sqlite3'
target.parent.mkdir(parents=True, exist_ok=True)
if source.exists() and not target.exists():
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as old:
        with sqlite3.connect(target) as new:
            old.backup(new)
    print('Existing learning records copied to current workspace; original database preserved.')
else:
    print('No database migration needed.')
