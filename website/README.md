# Chivalry: Medieval Warfare voice collection

Open **[index.html](index.html)** for the Chivalry-style faction → class → voice-command interface, or **[full-list.html](full-list.html)** for the full collection table.

Open either page directly in a browser. The collection works offline, directly from disk, without a server. Keep the HTML alongside the `audio` and `soundboard` folders.

Browse by faction, playable class, original asset name, **message group**, or **voice command**. Select **Personal Messages**, **Tactical Messages**, **Battle cry**, or **Other**. The command dropdown narrows to the selected group and follows the in-game menu order, including “Go for the Objective.” Switching groups clears an incompatible command selection. Each row has a Play button and MP3 download link. A shared player provides pause, seeking, and volume controls. Results are shown 50 at a time. The **Download all files** button beside the title downloads the complete audio hierarchy as a ZIP, regardless of active filters.

## Collection

**2,309 collection entries** (2,328 MP3 files including copies shared between categories), covering personal and tactical voice menus, battle cries, objective calls, barbarian variants, and legacy/alternate takes. Some clips serve more than one command; their command labels reflect all known cue references. The current collection excludes 577 audit candidates removed at the owner’s request; metadata and both website catalogs list only remaining files. The archival extractor can recreate the larger original set.

| Class | Agatha | Masons |
| --- | ---: | ---: |
| Archer | 289 | 308 |
| Knight | 283 | 255 |
| Man-at-Arms | 318 | 296 |
| Vanguard | 278 | 282 |
| **Total** | **1168** | **1141** |

For example, Agatha Vanguard has **278 clips**, including **15 Yes**, **16 No**, **7 Laugh**, and **7 Taunt** clips referenced by its personal menu. The remaining clips include other messages, objective calls, battle cries, and alternate takes.

The hierarchy mirrors the two in-game menus beneath every faction/class folder:

```text
audio/<faction>/<class>/
├── personal_messages/
│   ├── yes/
│   ├── no/
│   ├── help/
│   ├── got_your_back/
│   ├── thanks/
│   ├── youre_welcome/
│   ├── sorry/
│   ├── taunt/
│   ├── laugh/
│   └── respect/
├── tactical_messages/
│   ├── follow_me/
│   ├── forward/
│   ├── retreat/
│   ├── kill_archers/
│   ├── go_for_the_objective/
│   ├── hold_your_ground/
│   ├── defend_me/
│   ├── incoming/
│   ├── behind_us/
│   └── all_clear/
├── battlecry/
│   ├── animated/
│   └── running/
└── other/
```

Factions are `agatha` and `masons`; classes are `archer`, `knight`, `man_at_arms`, and `vanguard`. Each personal/tactical command folder contains its MP3s. Battle cries are classified from their original sound cue references and stored in `battlecry/animated/` (standing animation) or `battlecry/running/`. All eight voices have both directories. The soundboard offers a separate control for each type; the full collection has a Battle cry group with animated/running command filters. Unmatched legacy takes go directly into `other/`. A clip with a recognized menu command is kept under that command even if it also has a legacy cue label such as “Reform the line.”

The 19 clips used by two menu commands have identical MP3 copies in both command folders. The HTML lists each distinct clip once and includes shared clips in either applicable message group. `taunts.json` records the grouping in `message_groups` and `menu_commands`, every applicable path in `category_files`, and the primary playback path in `file`. Empty menu folders are retained. Existing asset filenames and audio bytes are preserved; names are game identifiers, not transcriptions.

## Coverage and verification

The extractor reads the installed game's `AOCPawnSoundgroup_Archer`, `ManAtArms`, `Knight`, and `Vanguard` source definitions. It resolves all **168 assignments**: 20 personal/tactical menu entries plus a battle cry for each of eight faction/class combinations. Every referenced wave is checked against the exported collection. The running battle cry cues are resolved separately from the same audio packages; the website exposes 22 commands per voice (176 total). This audit is saved in `taunts.json` under `menu_coverage`.

The extraction includes voice waves from `A_VO_Manual`, `A_VO_Manual_Barb`, and `A_VO_OBJ`, and follows cue graphs across package boundaries. The archival extractor preserves additional and legacy takes even when they are not linked to a current menu; the deployed collection has subsequently been pruned as described above. Clips with no matching menu command appear under **Other**; their original voice-type labels remain in the metadata and row descriptions. Sprint-attack grunts and silent placeholders are excluded. This is a voice-command collection; it is not an inventory of all game audio, NPC dialogue, damage sounds, or Workshop content.

The internal audio group names are misleading: the game assigns the Archer's voice menus to the `MAA` group and Man-at-Arms to the `Archer` group. The collection follows the playable class definitions. Generic legacy Agatha/Mason voices are assigned to Knight. Shared clips are included in every faction/class whose cues reference them.

Embedded Ogg streams are converted using FFmpeg's `libmp3lame -q:a 2`, retaining source channels and sample rates. Every MP3 was fully decoded using `ffmpeg -xerror` and inspected with `ffprobe`. Exact Ogg duplicates within a faction/class share one collection entry, with an MP3 copy in each applicable category; all source references are retained, including duplicate Troll-package taunts.

`taunts.json` records source hashes, export IDs, cue references, voice-command labels, durations, output hashes, and relative paths. The original game files are read only.

