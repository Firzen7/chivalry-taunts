#!/usr/bin/env python3
"""Build the downloadable ZIP from the actual audio directory, including empty folders."""
import argparse
from pathlib import Path
import tempfile
import zipfile


def build_archive(root):
    audio = root / 'audio'
    if not audio.is_dir():
        raise ValueError(f'Audio directory does not exist: {audio}')
    destination = root / 'downloads/chivalry-voice-commands.zip'
    destination.parent.mkdir(parents=True, exist_ok=True)
    paths = [audio, *sorted(audio.rglob('*'))]
    # MP3s are already compressed. Store them directly for fast builds/downloads
    # without a browser-side ZIP library or thousands of individual requests.
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.zip', delete=False) as temporary:
        staging = Path(temporary.name)
    try:
        with zipfile.ZipFile(staging, 'w', compression=zipfile.ZIP_STORED) as archive:
            for path in paths:
                archive.write(path, path.relative_to(root).as_posix())
        staging.replace(destination)
    finally:
        staging.unlink(missing_ok=True)
    print(f'Built {destination.relative_to(root)}: {sum(p.is_file() for p in paths)} files, {destination.stat().st_size:,} bytes.')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1] / 'website')
    build_archive(parser.parse_args().root)
