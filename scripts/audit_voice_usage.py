#!/usr/bin/env python3
"""Audit existing MP3 provenance and static game references without modifying audio."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import re
import struct

from extract_taunts import Package


def package_imports(path):
    """Read only UE3 v860 name/import tables; never load map/texture payloads."""
    with path.open('rb') as stream:
        header = stream.read(16)
        if len(header) != 16 or struct.unpack_from('<I', header)[0] != 0x9e2a83c1:
            raise ValueError('Not a UE3 package')
        if struct.unpack_from('<I', header, 4)[0] != 860:
            raise ValueError('Unsupported package version')
        group_length = struct.unpack_from('<i', header, 12)[0]
        stream.seek(16 + (group_length if group_length >= 0 else -group_length * 2) + 4)
        nc, no, _, _, ic, io = struct.unpack('<6i', stream.read(24))
        if not (0 <= nc < 1000000 and 0 <= ic < 1000000):
            raise ValueError('Invalid name/import counts')
        stream.seek(no)
        names = []
        for _ in range(nc):
            size = struct.unpack('<i', stream.read(4))[0]
            if not -100000 <= size <= 100000:
                raise ValueError('Name table is compressed or unsupported')
            raw = stream.read(size if size >= 0 else -size * 2)
            # Positive UE3 FStrings are ANSI, not necessarily UTF-8. Voice asset
            # identifiers are ASCII; latin-1 also preserves other byte values.
            names.append(raw.decode('latin-1' if size >= 0 else 'utf-16le').rstrip('\0'))
            stream.read(8)
        stream.seek(io)
        imports = stream.read(ic * 28)
        def fname(offset):
            index, number = struct.unpack_from('<2i', imports, offset)
            return names[index] + (f'_{number - 1}' if number else '')
        def full(index):
            if not index:
                return ''
            if index > 0:
                raise ValueError('Import with export outer')
            offset = (-index - 1) * 28
            outer = struct.unpack_from('<i', imports, offset + 16)[0]
            return '.'.join(filter(None, [full(outer), fname(offset + 20)]))
        return [(fname(i * 28 + 8), full(-i - 1)) for i in range(ic)]


def audit(root, output):
    manifest = json.loads((root / 'taunts.json').read_text())
    game = Path(manifest['source_game_folder'])
    cooked = game / 'UDKGame/CookedPC'
    paths = sorted(p for p in cooked.rglob('*') if p.suffix.lower() in ('.upk', '.udk', '.u'))
    package_paths = {p.stem.lower(): p for p in paths}
    class Packages(dict):
        def __missing__(self, key):
            value = Package(package_paths[key])
            self[key] = value
            return value
    packages = Packages()
    source_checks = []
    for source in manifest['sources']:
        path = game / source['package']
        valid = hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256']
        source_checks.append({'package': source['package'], 'sha256_matches_extraction': valid})
        if not valid:
            raise ValueError(f'Source package changed since extraction: {path}')
        packages[path.stem.lower()]
    # Include narrative voice packages as well as the four extraction packages.
    for path in (cooked / 'AOC/Sound/VO').glob('*.upk'):
        packages[path.stem.lower()]
    wave_cues = defaultdict(set)
    cue_failures = []
    for name in list(packages):
        pkg = packages[name]
        for entry in pkg.exports:
            if pkg.kind(entry) != 'SoundCue':
                continue
            cue = (pkg.path.stem + '.' + pkg.full(entry['index'])).lower()
            try:
                for wave in pkg.waves(entry['index'], packages):
                    wave_cues[wave].add(cue)
            except (KeyError, ValueError, IndexError, struct.error) as error:
                cue_failures.append({'cue': cue, 'error': str(error)})
    print(f'Resolved voice cue graphs; {len(cue_failures)} unresolved.', flush=True)
    source_refs = defaultdict(set)
    source_pattern = re.compile(r"(?:SoundCue|SoundNodeWave)\s*'([^']+)'", re.I)
    source_files = list((game / 'Development/Src').rglob('*.uc'))
    for path in source_files:
        text = path.read_text(errors='replace')
        # Preserve line numbers while excluding commented-out references.
        text = re.sub(r'/\*.*?\*/', lambda match: '\n' * match[0].count('\n'), text, flags=re.S)
        for line_no, line in enumerate(text.splitlines(), 1):
            line = line.split('//', 1)[0]
            for match in source_pattern.finditer(line):
                source_refs[match[1].lower()].add(f'{path.relative_to(game)}:{line_no}')
    cooked_refs = defaultdict(set)
    import_failures = []
    for index, path in enumerate(paths, 1):
        try:
            for kind, asset in package_imports(path):
                if kind.lower() in ('soundcue', 'soundnodewave'):
                    cooked_refs[asset.lower()].add(str(path.relative_to(game)))
        except (ValueError, UnicodeError, IndexError, struct.error, RecursionError) as error:
            import_failures.append({'package': str(path.relative_to(game)), 'error': str(error)})
        if index % 250 == 0:
            print(f'Inspected import tables: {index}/{len(paths)}', flush=True)
    # Resolve the manifest back to the actual source wave bytes, independently of labels.
    wave_hashes = {}
    by_path, by_hash = {}, defaultdict(list)
    for record in manifest['files']:
        for relative in set(record['category_files'].values()) | {record['file']}:
            by_path[relative] = record
        by_hash[record['mp3_sha256']].append(record)
        for source in record['sources']:
            key = (Path(source['package']).stem.lower(), source['export_index'])
            pkg = packages[key[0]]
            entry = pkg.obj(key[1])
            if pkg.kind(entry) != 'SoundNodeWave' or pkg.full(key[1]).lower() != source['asset'].lower():
                raise ValueError(f'Source asset mismatch: {source}')
            if key not in wave_hashes:
                wave_hashes[key] = hashlib.sha256(pkg.ogg(entry)).hexdigest()
            if wave_hashes[key] != record['source_ogg_sha256']:
                raise ValueError(f'Source audio mismatch: {source}')
    rows = []
    for path in sorted((root / 'audio').rglob('*.mp3')):
        relative = str(path.relative_to(root))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        record = by_path.get(relative)
        relocated = False
        if record is None:
            candidates = by_hash.get(digest, [])
            identity = Path(relative).parts[1:3]
            record = next((r for r in candidates if (r['faction'], r['class']) == identity), candidates[0] if candidates else None)
            relocated = record is not None
        if record is None or record['mp3_sha256'] != digest:
            rows.append(dict(file=relative, status='unverified_provenance', reason='MP3 bytes do not match any known extraction record; not proof of foreign audio.', sources='', cues='', source_references='', cooked_references='', relocated=relocated))
            continue
        waves = {(Path(s['package']).stem.lower(), s['export_index']) for s in record['sources']}
        assets = {f"{Path(s['package']).stem}.{s['asset']}".lower() for s in record['sources']}
        cues = set().union(*(wave_cues[key] for key in waves))
        references = assets | cues
        source_locations = set().union(*(source_refs[ref] for ref in references))
        # Internal imports only prove that a wave participates in its existing cue graph.
        # External imports and source references provide independent usage evidence.
        own_packages = {str(packages[key[0]].path.relative_to(game)) for key in waves}
        cooked_locations = set().union(*(cooked_refs[ref] for ref in references)) - own_packages
        if source_locations:
            status = 'referenced_in_game_source'
            reason = 'Wave or a containing SoundCue is referenced by non-commented UnrealScript (menus, map objectives, battle cries, etc.). Static reference is not a runtime recording.'
        elif cooked_locations:
            status = 'referenced_in_cooked_content'
            reason = 'Wave or a containing SoundCue is imported by another shipped cooked package/map/script. Kept as possible legitimate gameplay or special content.'
        elif not cues:
            status = 'likely_unused_no_cue'
            reason = 'Shipped source wave exists, but no containing SoundCue was found in the inspected voice packages, and no direct source/cooked import reference was found.'
        else:
            status = 'possibly_unused_unreferenced_cue'
            reason = 'Shipped wave belongs to a SoundCue, but no source or external cooked import reference to that cue or wave was found. Dynamic loading remains possible.'
        rows.append(dict(file=relative, status=status, reason=reason, sources=' | '.join(sorted(assets)), cues=' | '.join(sorted(cues)), source_references=' | '.join(sorted(source_locations)), cooked_references=' | '.join(sorted(cooked_locations)), relocated=relocated))
    output.mkdir(parents=True, exist_ok=True)
    fields = ['file', 'status', 'reason', 'sources', 'cues', 'source_references', 'cooked_references', 'relocated']
    suspects = [r for r in rows if r['status'] not in ('referenced_in_game_source', 'referenced_in_cooked_content')]
    for name, records in [('all-audio.csv', rows), ('suspected-unused.csv', suspects)]:
        with (output / name).open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            writer.writerows(records)
    summary = dict(existing_mp3s=len(rows), counts=dict(Counter(r['status'] for r in rows)),
                   verified_game_provenance=sum(r['status'] != 'unverified_provenance' for r in rows),
                   relocated_files=sum(r['relocated'] for r in rows),
                   source_packages=source_checks, source_files_scanned=len(source_files),
                   cooked_packages_scanned=len(paths), cooked_packages_read=len(paths)-len(import_failures),
                   unresolved_cues=cue_failures, unreadable_import_tables=import_failures)
    (output / 'audit-details.json').write_text(json.dumps(summary, indent=2)+'\n')
    lines = ['# Chivalry audio usage review', '',
             f'Reviewed **{len(rows)} existing MP3 files** under `website/audio/`. Missing catalog files are not counted. No audio or website files were changed.', '',
             f'**{summary["verified_game_provenance"]} files verified as authentic audio from the installed game; {len(suspects)} unused-content candidates.** Every candidate file is listed below. This includes {summary["relocated_files"]} files outside their current manifest paths, matched by audio hash instead of filename.', '',
             '## What the results mean', '',
             '“Contained in the installed game” and “used by normal gameplay” are different questions. A matching extracted MP3 hash and original Ogg wave hash prove provenance from the installed packages. Static references support possible use; missing references suggest unused content but cannot prove it is never played.', '',
             '| Result | Existing files |', '| --- | ---: |']
    for status, count in sorted(summary['counts'].items()):
        lines.append(f'| `{status}` | {count} |')
    lines += ['', '## Method and limits', '',
              '1. Enumerated actual MP3 files, not just catalog expectations. Matched their SHA-256 hashes to extraction records, including files moved to temporary subdirectories.',
              '2. Verified the four original package hashes against the extraction manifest. Resolved source asset names/export indices and verified the original Ogg bytes against each record’s source hash.',
              '3. Followed SoundCue graphs in the extraction and narrative voice packages. This checks actual wave references rather than assuming filenames indicate use.',
              f'4. Scanned {len(source_files)} UnrealScript files for non-commented SoundCue/SoundNodeWave references, including map-specific objective arrays and character MobileBattleCry assignments.',
              f'5. Inspected import tables in {len(paths)} installed `.upk`, `.udk`, and `.u` packages, with {len(import_failures)} unreadable tables. External cue or wave imports count as evidence to retain a recording.',
              '6. Classified unmatched raw waves as stronger unused candidates and unreferenced cues as weaker candidates. Package imports are conservative positive evidence, even when the importing content may itself be unused.', '',
              'This is a static audit of this installed build, not an instrumented playthrough. Maps, mods, dynamic object loading, editor-only assets, unused code, and random-node weights can affect actual playback. A referenced cue does not prove every child is selected at runtime. Source scripts may differ from compiled gameplay. Suspect files remain authentic shipped game audio; do not treat this list as a proven deletion list.', '',
              'Full results: [all-audio.csv](all-audio.csv). Candidate-only list with exact cue/asset evidence: [suspected-unused.csv](suspected-unused.csv). Scan gaps: [audit-details.json](audit-details.json).', '',
              'Reproduce from the project root: `python3 -B scripts/audit_voice_usage.py`. Paths below are relative to `website/`. Each CSV row corresponds to one existing physical MP3; shared category copies may refer to the same source wave.', '',
              '## Every candidate file', '']
    for status in ['unverified_provenance','likely_unused_no_cue','possibly_unused_unreferenced_cue']:
        subset = [r for r in suspects if r['status'] == status]
        lines += [f'### {status} ({len(subset)})', '']
        if not subset:
            lines += ['None.', '']
        else:
            lines += [subset[0]['reason'], '', '| File | Source wave |', '| --- | --- |']
            for row in subset:
                lines.append(f"| `{row['file']}` | `{row['sources']}` |")
            lines.append('')
    (output / 'README.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1] / 'website')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'reports/audio-usage')
    args = parser.parse_args()
    audit(args.root, args.output)
