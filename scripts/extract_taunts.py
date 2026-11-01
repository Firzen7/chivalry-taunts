#!/usr/bin/env python3
"""Extract Chivalry's uncompressed UE3 (version 860) voice commands and build a local index.

Requires Python 3 and ffmpeg/ffprobe. No third-party Python packages.
Package table layout: gildor2/UEViewer, Unreal/UnrealPackage/UnPackage3.cpp.
"""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html import escape
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile

CLASSES = {'archer': 'Archer', 'knight': 'Knight', 'man_at_arms': 'Man-at-Arms', 'vanguard': 'Vanguard'}
# Confirmed in Development/Src/AOCAudioContent/classes/AOCPawnSoundgroup_*.uc:
# XMenuVOSounds{Agatha,Mason}[7] maps Archer -> MAA and ManAtArms -> Archer.
GROUPS = {'archer': 'man_at_arms', 'maa': 'archer', 'knight': 'knight', 'vanguard': 'vanguard'}

class Package:
    def __init__(self, path):
        self.path = path
        self.data = b = path.read_bytes()
        if self.int(0) & 0xffffffff != 0x9e2a83c1 or self.int(4) != 860:
            raise ValueError(f'Unsupported package header: {path}')
        # Header field positions follow the variable-length package group string.
        p = 16 + self.int(12)
        nc, no, ec, eo, ic, io = struct.unpack_from('<6i', b, p + 4)
        depends = self.int(p + 28)
        self.names = []
        p = no
        for _ in range(nc):
            n = self.int(p); p += 4
            size = n if n > 0 else -n * 2
            raw = b[p:p + size]
            self.names.append(raw.decode('utf8' if n > 0 else 'utf-16le').rstrip('\0'))
            p += size + 8
        self.imports = []
        for p in range(io, io + ic * 28, 28):
            self.imports.append({'name': self.fname(p + 20), 'outer': self.int(p + 16)})
        self.exports = []
        p = eo
        for x in range(ec):
            cls, _, outer, _, _, _, _, _, size, offset, _, nnet = struct.unpack_from('<12i', b, p)
            if nnet < 0 or offset < 0 or offset + size > len(b):
                raise ValueError(f'Invalid export table in {path}')
            self.exports.append(dict(index=x + 1, name=self.fname(p + 12), cls=cls, outer=outer, size=size, offset=offset))
            p += 68 + nnet * 4
        self.lookup = {self.full(e['index']).lower(): e['index'] for e in self.exports}
        if p != depends:
            raise ValueError(f'Unexpected export table end in {path}')

    def int(self, p):
        return struct.unpack_from('<i', self.data, p)[0]

    def fname(self, p):
        n, number = struct.unpack_from('<2i', self.data, p)
        return self.names[n] + (f'_{number - 1}' if number else '')

    def obj(self, idx):
        return self.exports[idx - 1] if idx > 0 else self.imports[-idx - 1]

    def full(self, idx):
        if not idx:
            return ''
        e = self.obj(idx)
        return '.'.join(filter(None, [self.full(e['outer']), e['name']]))

    def kind(self, e):
        return self.obj(e['cls'])['name'] if e['cls'] else ''

    def properties(self, e):
        p, end = e['offset'] + 4, e['offset'] + e['size']
        while p < end:
            name = self.fname(p); p += 8
            if name == 'None':
                return
            typ = self.fname(p); size = self.int(p + 8); p += 16
            if typ in ('StructProperty', 'ByteProperty'):
                p += 8
            if typ == 'BoolProperty':
                p += 1
            if size < 0 or p + size > end:
                raise ValueError(f'Invalid property: {self.full(e["index"])}')
            yield name, self.data[p:p + size]
            p += size

    def waves(self, idx, packages, visited=None):
        visited = set() if visited is None else visited
        key = (self.path.stem.lower(), idx)
        if not idx or key in visited:
            return set()
        visited.add(key)
        if idx < 0:
            package_name, asset = self.full(idx).split('.', 1)
            target = packages[package_name.lower()]
            target_idx = target.lookup[asset.lower()]
            return target.waves(target_idx, packages, visited)
        e = self.obj(idx)
        if self.kind(e) == 'SoundNodeWave':
            return {key}
        result = set()
        for name, data in self.properties(e):
            refs = []
            if name in ('FirstNode', 'DestinationObject'):
                refs = struct.unpack('<i', data)
            elif name == 'ChildNodes':
                count = struct.unpack_from('<i', data)[0]
                refs = struct.unpack_from(f'<{count}i', data, 4)
            for ref in refs:
                result |= self.waves(ref, packages, visited)
        return result

    def ogg(self, e):
        data = self.data[e['offset']:e['offset'] + e['size']]
        start = pos = data.index(b'OggS')
        serial = None
        while True:
            if data[pos:pos + 5] != b'OggS\0':
                raise ValueError('Invalid Ogg page')
            current = struct.unpack_from('<I', data, pos + 14)[0]
            if serial is None:
                if not data[pos + 5] & 2:
                    raise ValueError('Missing Ogg stream start')
                serial = current
            if current != serial:
                raise ValueError('Unexpected Ogg stream serial')
            segments = data[pos + 26]
            end = pos + 27 + segments + sum(data[pos + 27:pos + 27 + segments])
            if end > len(data):
                raise ValueError('Truncated Ogg stream')
            eos = data[pos + 5] & 4
            pos = end
            if eos:
                return data[start:pos]


def category(asset):
    group = asset.split('.')[0].lower()
    if group in ('agatha', 'mason') or '.' not in asset:
        # Legacy generic taunt cues contain the Knight voice sets.
        return ('masons' if 'mason' in group else 'agatha'), 'knight'
    faction, cls = group.split('_', 1)
    return {'agatha': 'agatha', 'mason': 'masons'}[faction], GROUPS[cls]


def category_slug(label):
    return re.sub(r'[^a-z0-9]+', '_', label.lower().replace("'", '')).strip('_')


def organize_files(root, records):
    """Move verified MP3s into category folders; copy shared clips to each category."""
    categories = sorted({label for r in records for label in r['voice_types']})
    plans, destinations = [], {}
    for r in records:
        source = root / r['file']
        digest = r['mp3_sha256']
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Audio hash mismatch: {source}')
        category_files = {
            label: (Path(r['faction']) / r['class'] / category_slug(label) / source.name).as_posix()
            for label in sorted(r['voice_types'])
        }
        for rel in category_files.values():
            if rel.lower() in destinations and destinations[rel.lower()] != digest:
                raise ValueError(f'Category filename collision: {rel}')
            destinations[rel.lower()] = digest
            target = root / rel
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError(f'Refusing to overwrite different audio: {rel}')
        plans.append((r, source, category_files))
    # All source hashes and destination conflicts are checked before moving anything.
    for faction in ('agatha', 'masons'):
        for cls in CLASSES:
            for label in categories:
                (root / faction / cls / category_slug(label)).mkdir(parents=True, exist_ok=True)
    for r, source, category_files in plans:
        primary = next(iter(category_files.values()))
        target = root / primary
        if source != target and not target.exists():
            source.rename(target)
        for rel in category_files.values():
            copy = root / rel
            if not copy.exists():
                shutil.copy2(target, copy)
        if source != target and source.exists() and source not in {root / p for p in category_files.values()}:
            source.unlink()
        r['file'] = primary
        r['category_files'] = category_files


def build_html(root, files):
    rows = []
    for r in files:
        faction = 'Agatha' if r['faction'] == 'agatha' else 'Masons'
        label = f"{faction} {CLASSES[r['class']]}: {r['taunt_name']}"
        types = escape('|'.join(r['voice_types']), quote=True)
        rows.append(f'''<tr data-faction="{r['faction']}" data-class="{r['class']}" data-types="{types}">
<td><span class="faction {r['faction']}">{faction}</span></td>
<td>{CLASSES[r['class']]}</td><td class="taunt-name">{escape(r['taunt_name'])}<small>{escape(', '.join(r['voice_types']))}</small></td>
<td><button class="play" type="button" data-src="{escape(r['file'], quote=True)}" data-label="{escape(label, quote=True)}" aria-label="Play {escape(label, quote=True)}">▶ Play</button>
<a class="download" href="{escape(r['file'], quote=True)}" download aria-label="Download {escape(label, quote=True)}">MP3 ↓</a></td></tr>''')
    template = Path(__file__).with_name('index.template.html').read_text()
    types = sorted({t for r in files for t in r['voice_types']})
    options = ''.join(f'<option value="{escape(t, quote=True)}">{escape(t)}</option>' for t in types)
    (root / 'index.html').write_text(template.replace('<!-- ROWS -->', '\n'.join(rows)).replace('{{COUNT}}', str(len(files))).replace('<!-- TYPE OPTIONS -->', options))


VOICE_TYPES = {
    'yes': 'Yes', 'no': 'No', 'help': 'Help', 'got_your_back': 'Got your back',
    'thanks': 'Thanks', 'you_are_welcome': "You're welcome", 'sorry': 'Sorry',
    'random_taunt': 'Taunt', 'random_laugh': 'Laugh', 'random_respect': 'Respect',
    'respect': 'Respect', 'follow_me': 'Follow me', 'forward': 'Forward',
    'retreat': 'Retreat', 'archers': 'Kill archers', 'hold_ground': 'Hold your ground',
    'defend_me': 'Defend me', 'incoming': 'Incoming', 'behind_us': 'Behind us',
    'all_clear': 'All clear', 'clear': 'All clear', 'reform_the_line': 'Reform the line',
    'battlecry': 'Battle cry', 'objective': 'Objective', 'manual_vo_obj': 'Objective', 'objvo': 'Objective',
}

def voice_type(name):
    name = name.lower()
    for prefix, label in VOICE_TYPES.items():
        if name == prefix or name.startswith(prefix + '_') or prefix == 'manual_vo_obj' and name.startswith(prefix):
            return label
    return None


def collect(game):
    cooked = game / 'UDKGame/CookedPC'
    paths = [cooked / 'AOC/Sound/VO/A_VO_Manual.upk', cooked / 'AOC/Sound/VO/A_VO_OBJ.upk',
             cooked / 'Sound/A_VO_Manual_Barb.upk', cooked / 'Sound/Troll_VO.upk']
    packages = {p.stem.lower(): Package(p) for p in paths}
    selected = defaultdict(lambda: {'voice_types': set(), 'voice_cues': set()})
    # Preserve additional/legacy takes, including ones not used by a current cue.
    for package_name, pkg in packages.items():
        for e in pkg.exports:
            if pkg.kind(e) != 'SoundNodeWave':
                continue
            if package_name == 'troll_vo' and 'taunt' not in e['name'].lower():
                continue
            if any(word in e['name'].lower() for word in ('sprint', 'grunt', 'blank', 'silence')):
                continue
            faction, cls = category(pkg.full(e['index']))
            usage = selected[(package_name, e['index'], faction, cls)]
            if 'taunt' in e['name'].lower():
                usage['voice_types'].add('Taunt')
            if package_name == 'a_vo_obj':
                usage['voice_types'].add('Objective')
    # Follow every personal/tactical/battle-cry cue, including cross-package references.
    for package_name, pkg in packages.items():
        if package_name == 'troll_vo':
            continue
        for e in pkg.exports:
            if pkg.kind(e) != 'SoundCue':
                continue
            typ = voice_type(e['name'])
            if not typ:
                if e['name'].lower().startswith('sprint_grunt') or e['name'] in ('1blank_vo', 'A_VO_Manual'):
                    continue
                raise ValueError(f'Unclassified voice cue: {pkg.path.name}:{pkg.full(e["index"])}')
            faction, cls = category(pkg.full(e['index']))
            cue = pkg.path.stem + '.' + pkg.full(e['index'])
            for wave_pkg, idx in pkg.waves(e['index'], packages):
                usage = selected[(wave_pkg, idx, faction, cls)]
                usage['voice_types'].add(typ)
                usage['voice_cues'].add(cue)
    # Independently audit all 20 menu slots + battle cry for each playable voice.
    menu_coverage = []
    folder = game / 'Development/Src/AOCAudioContent/classes'
    class_names = {'Archer': 'archer', 'ManAtArms': 'man_at_arms', 'Knight': 'knight', 'Vanguard': 'vanguard'}
    pattern = r"(?m)^\s*(?:(XMenuVOSounds|ZMenuVOSounds)(Agatha|Mason)\[(\d+)\]|(BattleCrySound)(Agatha|Mason))\s*=\s*SoundCue'([^']+)'"
    for source_class, cls in class_names.items():
        text = (folder / f'AOCPawnSoundgroup_{source_class}.uc').read_text()
        assignments = {}
        for match in re.finditer(pattern, text):
            menu, faction, slot, battle, battle_faction, cue = match.groups()
            assignments[(menu or battle, faction or battle_faction, slot or '')] = cue
        if len(assignments) != 42:
            raise ValueError(f'Expected 42 voice assignments for {source_class}, got {len(assignments)}')
        for (menu, faction, slot), cue in assignments.items():
            package_name, asset = cue.split('.', 1)
            pkg = packages[package_name.lower()]
            idx = pkg.lookup[asset.lower()]
            waves = pkg.waves(idx, packages)
            if not waves:
                raise ValueError(f'Empty voice menu cue: {cue}')
            faction = {'Agatha': 'agatha', 'Mason': 'masons'}[faction]
            typ = voice_type(asset.rsplit('.', 1)[-1])
            for wp, wi in waves:
                usage = selected[(wp, wi, faction, cls)]
                usage['voice_types'].add(typ)
                usage['voice_cues'].add(cue)
            menu_coverage.append(dict(faction=faction, **{'class': cls}, menu=menu, slot=slot, voice_type=typ, cue=cue,
                                      waves=[{'package': wp, 'export_index': wi} for wp, wi in sorted(waves)]))
    candidates = []
    for (package_name, idx, faction, cls), usage in sorted(selected.items()):
        pkg = packages[package_name]; e = pkg.obj(idx)
        data = pkg.ogg(e)
        candidates.append(dict(faction=faction, class_=cls, taunt_name=e['name'], data=data,
            voice_types=sorted(usage['voice_types']) or ['Other voice lines'], digest=hashlib.sha256(data).hexdigest(),
            source={'package': str(pkg.path.relative_to(game)), 'asset': pkg.full(idx), 'export_index': idx,
                    'voice_cues': sorted(usage['voice_cues'])}))
    sources = [{'package': str(p.path.relative_to(game)), 'sha256': hashlib.sha256(p.data).hexdigest()} for p in packages.values()]
    return candidates, sources, menu_coverage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_folder', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--audit-only', action='store_true', help='Inspect coverage without writing files')
    args = parser.parse_args()
    root = args.output.resolve()
    candidates, sources, coverage = collect(args.game_folder)
    print(f'Found {len(candidates)} source/class entries; resolved all {len(coverage)} voice-menu assignments.', flush=True)
    if args.audit_only:
        print(json.dumps({'counts': dict(Counter(f"{c['faction']}/{c['class_']}" for c in candidates)),
                          'voice_types': dict(Counter(t for c in candidates for t in c['voice_types']))}, indent=2))
        return
    old = json.loads((root / 'taunts.json').read_text()) if (root / 'taunts.json').exists() else {'files': []}
    previous = {(r['faction'], r['class'], r['source_ogg_sha256']): r for r in old['files']}
    # Reuse existing paths, including collision suffixes from the initial collection.
    paths = {(Path(r['faction']) / r['class'] / Path(r['file']).name).as_posix().lower() for r in old['files']}
    records, jobs, seen = [], [], {}
    for c in candidates:
        key = (c['faction'], c['class_'], c['digest'])
        if key in seen:
            r = seen[key]
            r['sources'].append(c['source'])
            r['voice_types'] = sorted(set(r['voice_types']) | set(c['voice_types']))
            continue
        prior = previous.get(key)
        if prior:
            rel = Path(prior['file'])
        else:
            filename = re.sub(r'[^A-Za-z0-9_-]', '_', c['taunt_name']) + '.mp3'
            rel = Path(c['faction']) / c['class_'] / filename
            if str(rel).lower() in paths:
                suffix = Path(c['source']['package']).stem + '_' + str(c['source']['export_index'])
                rel = rel.with_stem(rel.stem + '__' + suffix)
            if str(rel).lower() in paths:
                raise ValueError(f'Filename collision: {rel}')
        paths.add((Path(c['faction']) / c['class_'] / rel.name).as_posix().lower())
        r = dict(faction=c['faction'], **{'class': c['class_']}, taunt_name=c['taunt_name'], file=rel.as_posix(),
                 voice_types=c['voice_types'], source_ogg_sha256=c['digest'], sources=[c['source']])
        records.append(r); seen[key] = r
        jobs.append((r, c['data'], prior))
    # A known command category is more useful than the fallback label after deduplication.
    for r in records:
        if len(r['voice_types']) > 1 and 'Other voice lines' in r['voice_types']:
            r['voice_types'].remove('Other voice lines')

    def convert(job):
        r, data, prior = job
        output = root / r['file']
        output.parent.mkdir(parents=True, exist_ok=True)
        can_reuse = (prior and output.is_file() and prior.get('mp3_sha256')
                     and hashlib.sha256(output.read_bytes()).hexdigest() == prior['mp3_sha256'])
        if can_reuse:
            for field in ('duration_seconds', 'bytes', 'mp3_sha256'):
                r[field] = prior[field]
            return
        with tempfile.TemporaryDirectory(prefix='chivalry-voice-') as tmp:
            ogg = Path(tmp) / 'source.ogg'; ogg.write_bytes(data)
            mp3 = Path(tmp) / 'output.mp3'
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(ogg), '-map', '0:a:0', '-c:a', 'libmp3lame', '-threads', '1', '-q:a', '2', '-metadata', 'title=' + r['taunt_name'], str(mp3)], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-threads', '1', '-i', str(mp3), '-f', 'null', '-'], check=True)
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(mp3)]))
            if probe['streams'][0]['codec_name'] != 'mp3' or float(probe['format']['duration']) <= 0:
                raise ValueError(f'Invalid MP3: {r["file"]}')
            encoded = mp3.read_bytes()
            output.write_bytes(encoded)
            r.update(duration_seconds=float(probe['format']['duration']), bytes=len(encoded), mp3_sha256=hashlib.sha256(encoded).hexdigest())
    with ThreadPoolExecutor(max_workers=4) as executor:
        for count, _ in enumerate(executor.map(convert, jobs), 1):
            if count % 100 == 0 or count == len(jobs):
                print(f'Validated {count}/{len(jobs)} MP3s', flush=True)
    # Verify coverage against actual output records, not just the selected source waves.
    exported = {(Path(s['package']).stem.lower(), s['export_index'], r['faction'], r['class']) for r in records for s in r['sources']}
    for entry in coverage:
        for wave in entry['waves']:
            assert (wave['package'], wave['export_index'], entry['faction'], entry['class']) in exported
        entry['verified'] = True
    records.sort(key=lambda r: (r['faction'], r['class'], r['taunt_name'].lower()))
    organize_files(root, records)
    manifest = dict(source_game_folder=str(args.game_folder), sources=sources,
        selection='All non-grunt voice waves in the Manual, Manual_Barb and OBJ packages, all personal/tactical/battle-cry cue references (including cross-package references), and the original Troll taunt duplicates. Exact Ogg duplicates within a faction/class share one collection entry.',
        file_layout='faction/class/category/asset_name.mp3; shared clips have a copy in every applicable category. category_files lists all paths; file is the primary playback path.',
        class_mapping='Playable classes from AOCPawnSoundgroup_*.uc menu assignments; group Archer -> Man-at-Arms, MAA -> Archer. Shared cue audio is included in every faction/class that references it. Generic legacy Agatha/Mason voices are assigned to Knight.',
        encoding='ffmpeg libmp3lame -q:a 2; every MP3 fully decoded with ffmpeg -xerror. Rebuilds reuse unchanged, hash-verified MP3s.',
        menu_coverage=coverage, files=records)
    (root / 'taunts.json').write_text(json.dumps(manifest, indent=2) + '\n')
    build_html(root, records)
    print(json.dumps({'files': len(records), 'counts': dict(Counter(f"{r['faction']}/{r['class']}" for r in records)),
                      'voice_types': dict(Counter(t for r in records for t in r['voice_types']))}, indent=2))

if __name__ == '__main__':
    main()
