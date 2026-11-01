# Chivalry: Medieval Warfare voice collection

Open **index.html** in a browser. The collection works offline, directly from disk, without a server. Keep the HTML alongside the faction folders.

Browse by faction, playable class, original asset name, or **voice command**. The command filter includes Yes, No, Laugh, Taunt, Respect, Battle cry, Objective, and the other personal/tactical messages. Each row has a Play button and MP3 download link. A shared player provides pause, seeking, and volume controls. Results are shown 50 at a time.

## Collection

**2,938 distinct clips** (2,970 MP3 files including copies shared between categories), covering personal and tactical voice menus, battle cries, objective calls, barbarian variants, and legacy/alternate takes. Some clips serve more than one command; their command labels reflect all known cue references.

| Class | Agatha | Masons |
| --- | ---: | ---: |
| Archer | 296 | 516 |
| Knight | 441 | 484 |
| Man-at-Arms | 321 | 299 |
| Vanguard | 289 | 292 |
| **Total** | **1347** | **1591** |

For example, Agatha Vanguard has **289 clips**, including **15 Yes**, **16 No**, **7 Laugh**, and **7 Taunt** clips referenced by its personal menu. The remaining clips include other messages, objective calls, battle cries, and alternate takes.

Files are stored as `<faction>/<class>/<category>/<asset_name>.mp3`, using `agatha` and `masons`, then `archer`, `knight`, `man_at_arms`, or `vanguard`. Each class has all 23 category folders, including `yes`, `no`, `laugh`, `taunt`, `battle_cry`, `objective`, and `other_voice_lines`. Folder names use lowercase words separated by underscores; “You're welcome” is `youre_welcome`.

The 32 clips used by two commands have identical MP3 copies in both category folders. The HTML lists each distinct clip once. `taunts.json` records every applicable path in `category_files`, with `file` pointing to its primary playback copy. Category folders with no clips for a particular class remain empty. Colliding filenames receive a suffix; existing filenames are preserved on rebuild. The names are game asset identifiers, not transcriptions.

## Coverage and verification

The extractor reads the installed game's `AOCPawnSoundgroup_Archer`, `ManAtArms`, `Knight`, and `Vanguard` source definitions. It resolves all **168 assignments**: 20 personal/tactical menu entries plus a battle cry for each of eight faction/class combinations. Every referenced wave is checked against the exported collection. This audit is saved in `taunts.json` under `menu_coverage`.

The extraction includes voice waves from `A_VO_Manual`, `A_VO_Manual_Barb`, and `A_VO_OBJ`, and follows cue graphs across package boundaries. It preserves additional and legacy takes even when they are not linked to a current menu. Unclassified extra takes appear under **Other voice lines**. Sprint-attack grunts and silent placeholders are excluded. This is a voice-command collection; it is not an inventory of all game audio, NPC dialogue, damage sounds, or Workshop content.

The internal audio group names are misleading: the game assigns the Archer's voice menus to the `MAA` group and Man-at-Arms to the `Archer` group. The collection follows the playable class definitions. Generic legacy Agatha/Mason voices are assigned to Knight. Shared clips are included in every faction/class whose cues reference them.

Embedded Ogg streams are converted using FFmpeg's `libmp3lame -q:a 2`, retaining source channels and sample rates. Every MP3 was fully decoded using `ffmpeg -xerror` and inspected with `ffprobe`. Exact Ogg duplicates within a faction/class share one collection entry, with an MP3 copy in each applicable category; all source references are retained, including duplicate Troll-package taunts.

`taunts.json` records source hashes, export IDs, cue references, voice-command labels, durations, output hashes, and relative paths. The original game files are read only.

## Rebuild

Requires Python 3, FFmpeg, and ffprobe:

```sh
python3 scripts/extract_taunts.py /path/to/chivalrymedievalwarfare
```

Inspect source coverage without writing files:

```sh
python3 scripts/extract_taunts.py /path/to/chivalrymedievalwarfare --audit-only
```

The build maintains the category folders and updates MP3s, `taunts.json`, and `index.html`. Unchanged, hash-verified MP3s are reused. Edit `scripts/index.template.html` to change the page before rebuilding. The package reader targets this installation's uncompressed UE3 version 860 format and rejects unsupported layouts.
