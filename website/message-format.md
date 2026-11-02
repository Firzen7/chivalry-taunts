# Personalized voice messages

Open `message.html?data=BASE64_JSON` or `message.html#data=BASE64_JSON`. Encode compact JSON as UTF-8 and then URL-safe Base64 without padding. Standard Base64 remains supported too; URL-encode it when using a query parameter.

```json
{"f":"a","c":"k","n":"Firzen","m":"See you on the battlefield!","v":"p/thanks/thank_you_brother_01.mp3"}
```

| Field | Meaning | Values |
| --- | --- | --- |
| `f` | Faction | `a` = agatha, `m` = masons |
| `c` | Class | `k` = knight, `a` = archer, `v` = vanguard, `m` = man_at_arms |
| `n` | Nickname | Up to 80 characters |
| `m` | Custom message | Up to 4,000 characters, including Unicode and newlines |
| `v` | Voice recording | Folder shortcut followed by the remaining path |

| Voice prefix | Expanded folder beneath `audio/<faction>/<class>/` |
| --- | --- |
| `p/` | `personal_messages/` |
| `t/` | `tactical_messages/` |
| `br/` | `battlecry/running/` |
| `ba/` | `battlecry/animated/` |
| `o/` | `other/` |

For example, `f=a`, `c=k`, and `v=p/thanks/thank_you_brother_01.mp3` resolve to `audio/agatha/knight/personal_messages/thanks/thank_you_brother_01.mp3`. Keep the category folder and exact filename, including `.mp3`. The expanded path must match a catalogued recording for that warrior. No random selection occurs.

The page continues to accept the previous `faction`, `class`, `nickname`, `message`, and full-path `voice_variant` format.

## Creating links

Load `soundboard/message-codec.js` to use its helper. It accepts either the compact payload above or a verbose payload, converts it to compact JSON, and returns unpadded URL-safe Base64:

```js
const encoded = ChivalryMessageCodec.encode({
  f: 'a', c: 'k', n: 'Firzen',
  m: 'See you on the battlefield!',
  v: 'p/thanks/thank_you_brother_01.mp3'
});
const url = new URL('message.html', location.href);
url.searchParams.set('data', encoded);
console.log(url.href);
```

`ChivalryMessageCodec.compact(payload)` returns the compact JSON object, while `expand(payload)` returns the verbose object with the full audio path. The codec handles formatting; `message.html` validates field lengths and checks the expanded recording against the catalog before playback.

Reveal removes the blur and starts the exact recording immediately, alongside the one-second fade. Sound starts enabled; the toggle mutes/unmutes playback. Replay restarts that same recording. Invalid payloads show an explanatory error. Message content is inserted as plain text. Base64 is encoding, not encryption; the blur is a presentation effect.

Open `message-examples.html` for four compact testing links covering both factions, four classes, and Unicode text. These also work directly from disk.
