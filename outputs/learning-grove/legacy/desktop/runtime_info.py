import hashlib
from pathlib import Path

VERSION = '0.5.0-garden'


def project_id(root, data_dir):
    value = str(Path(root).resolve()).casefold() + '|' + str(Path(data_dir).resolve()).casefold()
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:20]
