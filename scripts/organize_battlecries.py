#!/usr/bin/env python3
"""Move existing battle cries into animated/running folders without re-extracting audio."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from extract_taunts import CLASSES, MESSAGE_GROUPS, COMMAND_LABELS, build_html, command_directory, menu_commands
from build_soundboard import build


def organize(root):
    manifest = json.loads((root / 'taunts.json').read_text())
    plans = []
    for record in manifest['files']:
        if 'Battle cry' not in record['voice_types']:
            continue
        source = root / record['file']
        old_paths = {record['file'], *record['category_files'].values()}
        commands = menu_commands(record)
        targets = {command: (Path('audio') / record['faction'] / record['class'] / command_directory(command) / source.name).as_posix()
                   for command in commands}
        # Validate all moves before changing any files. Unrelated recordings are untouched.
        for relative in old_paths | set(targets.values()):
            path = root / relative
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != record['mp3_sha256']:
                raise ValueError(f'Audio hash mismatch: {path}')
        if not source.is_file():
            raise ValueError(f'Missing battle cry: {source}')
        plans.append((record, source, old_paths, targets))
    for faction in ('agatha', 'masons'):
        for cls in CLASSES:
            for variant in ('animated', 'running'):
                (root / 'audio' / faction / cls / 'battlecry' / variant).mkdir(parents=True, exist_ok=True)
    aliases = manifest.setdefault('audio_path_aliases', {})
    for record, source, old_paths, targets in plans:
        primary = next(iter(targets.values()))
        destination = root / primary
        if source != destination and not destination.exists():
            source.rename(destination)
        for relative in targets.values():
            target = root / relative
            if not target.exists():
                shutil.copy2(destination, target)
        for old_path in old_paths - set(targets.values()):
            aliases[old_path] = primary
            (root / old_path).unlink(missing_ok=True)
        record.update(file=primary, category_files=targets, menu_commands=list(targets), message_groups=['battlecry'])
    manifest['message_groups'] = {group: {'label': label, 'commands': [COMMAND_LABELS.get(c, c) for c in commands]}
                                  for group, (label, commands) in MESSAGE_GROUPS.items()}
    manifest['file_layout'] = ('audio/faction/class/personal_messages|tactical_messages/command/asset_name.mp3; '
                               'battle cries go in audio/faction/class/battlecry/animated|running/asset_name.mp3; '
                               'remaining clips go in audio/faction/class/other/. Shared clips have a copy in every '
                               'applicable command; category_files lists all paths and file is the primary playback path.')
    (root / 'taunts.json').write_text(json.dumps(manifest, indent=2) + '\n')
    build_html(root, manifest['files'])
    # Partial collections are supported: preserve intentional removals of other audio.
    build(root, allow_missing=True)
    print(f'Organized {len(plans)} battle cries; original MP3 content verified and preserved.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1] / 'website')
    organize(parser.parse_args().root)
