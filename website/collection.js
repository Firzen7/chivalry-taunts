/* Full collection filters, availability checks, pagination, and playback. */
(() => {
'use strict';
const rows = [...document.querySelectorAll('tbody tr')];
const search = document.querySelector('#search');
const faction = document.querySelector('#faction');
const classFilter = document.querySelector('#class');
const groupFilter = document.querySelector('#group');
const typeFilter = document.querySelector('#type');
const commandOptions = [...typeFilter.options].map(option => option.cloneNode(true));
const player = document.querySelector('#player');
const error = document.querySelector('#play-error');
const availability = new window.ChivalryAvailability({remote: /^https?:$/.test(location.protocol)});
const available = new Map();
let candidates = [];
let matches = [];
let checking = false;
let scan = 0;
let renderTimer = null;
let page = 0;
let activeButton = null;
const pageSize = 50;
for (const row of rows) {
  row.searchText = row.textContent.toLowerCase();
  row.hidden = true;
}
document.querySelector('tbody').hidden = false;
function renderPage() {
  matches = candidates.filter(row => available.get(row) === true);
  page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  for (const row of rows) row.hidden = true;
  for (const row of matches.slice(page * pageSize, (page + 1) * pageSize)) row.hidden = false;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  document.querySelector('#count').textContent = `${matches.length} available voice clips${checking ? ' · Checking recordings…' : ''}`;
  document.querySelector('#availability-error').hidden = !candidates.some(row => available.get(row) === 'error');
  document.querySelector('#page-count').textContent = `Page ${page + 1} of ${pages}`;
  document.querySelector('#previous').disabled = page === 0;
  document.querySelector('#next').disabled = page >= pages - 1;
  const empty = document.querySelector('#empty');
  empty.hidden = matches.length !== 0;
  empty.textContent = checking ? 'Checking available recordings…'
    : candidates.some(row => available.get(row) === 'error') ? 'No available voice lines could be confirmed. Try checking again.'
    : 'No matching voice lines are available. Try another search or reset the filters.';
}
async function filter() {
  const currentScan = ++scan;
  const query = search.value.trim().toLowerCase();
  candidates = rows.filter(row => (!faction.value || row.dataset.faction === faction.value)
    && (!classFilter.value || row.dataset.class === classFilter.value)
    && (!groupFilter.value || row.dataset.groups.split('|').includes(groupFilter.value))
    && (!typeFilter.value || row.dataset.types.split('|').includes(typeFilter.value))
    && row.searchText.includes(query));
  page = 0;
  const pending = candidates.filter(row => typeof available.get(row) !== 'boolean');
  let cursor = 0;
  checking = pending.length > 0;
  renderPage();
  // Prioritize the current filter and stop scheduling obsolete scans. The shared
  // checker bounds HTTP/media work and caches results across filter changes.
  await Promise.all(Array.from({length: Math.min(6, pending.length)}, async () => {
    while (currentScan === scan && cursor < pending.length) {
      const row = pending[cursor++];
      try {
        available.set(row, await availability.check(row.querySelector('.play').dataset.src));
      } catch {
        available.set(row, 'error');
      }
      if (currentScan === scan && renderTimer === null) {
        renderTimer = setTimeout(() => { renderTimer = null; renderPage(); }, 50);
      }
    }
  }));
  if (currentScan !== scan) return;
  checking = false;
  clearTimeout(renderTimer);
  renderTimer = null;
  renderPage();
}
document.querySelector('#retry-availability').addEventListener('click', filter);
search.addEventListener('input', filter);
faction.addEventListener('change', filter);
classFilter.addEventListener('change', filter);
typeFilter.addEventListener('change', filter);
function syncCommands() {
  const selected = typeFilter.value;
  const options = commandOptions.filter(option => !option.value || !groupFilter.value || option.dataset.group === groupFilter.value);
  typeFilter.replaceChildren(...options.map(option => option.cloneNode(true)));
  typeFilter.value = options.some(option => option.value === selected) ? selected : '';
}
groupFilter.addEventListener('change', () => { syncCommands(); filter(); });
document.querySelector('#reset').addEventListener('click', () => {
  search.value = faction.value = classFilter.value = groupFilter.value = typeFilter.value = '';
  syncCommands();
  filter();
});
document.querySelector('#previous').addEventListener('click', () => {
  if (page > 0) { page--; renderPage(); }
});
document.querySelector('#next').addEventListener('click', () => {
  if ((page + 1) * pageSize < matches.length) { page++; renderPage(); }
});
function updatePlayButton() {
  if (!activeButton) return;
  activeButton.textContent = player.paused ? '▶ Play' : 'Ⅱ Pause';
  activeButton.classList.toggle('active', !player.paused);
  activeButton.setAttribute('aria-label', `${player.paused ? 'Play' : 'Pause'} ${activeButton.dataset.label}`);
}
document.querySelector('tbody').addEventListener('click', async event => {
  const button = event.target.closest('button.play');
  if (!button || available.get(button.closest('tr')) !== true) return;
  if (button === activeButton && !player.paused) { player.pause(); return; }
  error.hidden = true;
  if (button !== activeButton) {
    player.pause();
    updatePlayButton();
    activeButton = button;
    player.src = button.dataset.src;
    document.querySelector('#now-playing').textContent = button.dataset.label;
    player.setAttribute('aria-label', button.dataset.label);
  }
  try { await player.play(); }
  catch (failure) { if (failure.name !== 'AbortError') error.hidden = false; }
});
player.addEventListener('play', updatePlayButton);
player.addEventListener('pause', updatePlayButton);
player.addEventListener('ended', updatePlayButton);
player.addEventListener('error', () => { error.hidden = false; });
filter();
})();
