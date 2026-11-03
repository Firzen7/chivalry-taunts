# Message link previews

`message.html` includes static Open Graph and Twitter large-image metadata for `soundboard/assets/message-link-preview.jpg` (1733 × 907), with the caption “Psst! Someone has sent you something!” Deploy the updated HTML and image with the rest of `website/`. No backend is required.

All message links share this preview; the nickname and custom message are displayed when the recipient opens the page.

The image URLs currently use `https://chivalry.firzen.net/`, matching `index.html`. Update the Open Graph/Twitter image URLs in `message.html` if moving to another public host or deployment path. Sharing services may cache existing previews until they refresh them.
