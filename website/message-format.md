# Personalized voice messages

Open `message.html?data=BASE64_JSON` (or `message.html#data=BASE64_JSON`). Both standard Base64 and URL-safe Base64 are supported. Encode JSON as UTF-8 before Base64 encoding, and URL-encode standard Base64 when putting it in a query parameter.

The JSON contains these required fields:

```json
{
  "faction": "agatha",
  "class": "knight",
  "nickname": "Firzen",
  "message": "See you on the battlefield!",
  "voice_variant": "audio/agatha/knight/personal_messages/thanks/thank_you_brother_01.mp3"
}
```

Use an exact `clips[].file` value from that faction and class in `soundboard/catalog.js` for `voice_variant`. There is no random voice selection. Factions are `agatha` and `masons`. Classes are `archer`, `man_at_arms`, `vanguard`, and `knight`. Nicknames may contain up to 80 characters and messages up to 4,000 characters, including newlines and Unicode.

To create a link in JavaScript:

```js
const payload = {
  faction: 'agatha',
  class: 'knight',
  nickname: 'Firzen',
  message: 'See you on the battlefield!',
  voice_variant: CHIVALRY_CATALOG.agatha.knight.personal[4].clips[0].file
};
const bytes = new TextEncoder().encode(JSON.stringify(payload));
const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const url = new URL('message.html', location.href);
url.searchParams.set('data', encoded);
console.log(url.href);
```

The portrait follows the chosen faction/class. Reveal removes the blur and starts the exact recording within the same click. Sound starts enabled; the toggle mutes/unmutes playback. Replay restarts that same recording. Invalid payloads or recordings outside the chosen voice catalog show an explanatory error. Message text is inserted as plain text. The payload is encoded, not encrypted; the blur is a presentation effect.

Open `message-examples.html` for four clickable test links covering both factions, four classes, and Unicode text. These also work from disk. The existing soundboard artwork, font, and backdrop are reused; the message page has its own small stylesheet and script.
