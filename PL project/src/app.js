const input = document.querySelector('#player-search');
const results = document.querySelector('#search-results');
const resultSection = document.querySelector('#result');
const emptyState = document.querySelector('#empty-state');
const searchHint = document.querySelector('.search-hint');
const announcement = document.querySelector('#search-announcement');
const clearSearch = document.querySelector('#clear-search');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let debounceTimer, searchController, predictionController;
let activeRequest = 0, activePrediction = 0, selectedIndex = -1;
let selectedPlayer;

if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelector('#search-shortcut').textContent = '⌘ K';

async function updateSearchHint(attempt = 0) {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Service unavailable');
    const status = await response.json();
    if (!status.modelAvailable || status.modelError) searchHint.textContent = 'Player archive available · Valuations temporarily unavailable';
    else if (!status.modelReady) {
      searchHint.textContent = 'Player archive available · The valuation model is warming up';
      if (attempt < 40) setTimeout(() => updateSearchHint(attempt + 1), 2500);
    } else searchHint.textContent = 'Player archive connected · Ready to explore';
  } catch { searchHint.textContent = 'Connection unavailable · Try searching again in a moment'; }
}
updateSearchHint();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}

function portrait(name, large = false) {
  const initials = String(name || '?').trim().split(/\s+/).map(word => word[0]).filter(Boolean);
  const value = initials.length > 1 ? initials[0] + initials[initials.length - 1] : initials[0];
  return `<span class="player-thumb ${large ? 'result-portrait' : ''}" aria-hidden="true">${escapeHtml(value)}</span>`;
}

function formatNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('en-GB').format(Number(value));
}

function closeResults() {
  results.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  selectedIndex = -1;
}

function openResults() {
  results.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function renderResults(players) {
  selectedIndex = -1;
  input.removeAttribute('aria-activedescendant');
  results.innerHTML = players.length ? players.map((player, index) => `<button type="button" class="search-result" id="player-option-${index}" role="option" tabindex="-1" aria-selected="false" data-id="${escapeHtml(player.id)}"><span>${portrait(player.name)}</span><span><span class="result-name">${escapeHtml(player.name)}</span><span class="result-meta">${escapeHtml(player.position || 'Player')} · ${escapeHtml(player.season || 'Historical season')}</span></span><span class="result-arrow" aria-hidden="true">↗</span></button>`).join('') : '<div class="no-results">No players found. Try a shorter name or check the spelling.</div>';
  announcement.textContent = players.length ? `${players.length} matching player${players.length === 1 ? '' : 's'}. Use the arrow keys to choose.` : 'No matching players found.';
  openResults();
}

input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  searchController?.abort();
  const requestId = ++activeRequest;
  const query = input.value.trim();
  clearSearch.hidden = !input.value;
  if (query.length < 3) { closeResults(); results.replaceChildren(); return; }
  selectedIndex = -1;
  input.removeAttribute('aria-activedescendant');
  results.innerHTML = '<div class="no-results">Searching the player archive…</div>';
  openResults();
  debounceTimer = setTimeout(async () => {
    searchController = new AbortController();
    try {
      const response = await fetch(`/api/players?q=${encodeURIComponent(query)}`, {signal:searchController.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The archive is temporarily unavailable. Please try again.');
      if (requestId === activeRequest) renderResults(data.players || []);
    } catch (error) {
      if (requestId === activeRequest && error.name !== 'AbortError') {
        results.innerHTML = `<div class="no-results">${escapeHtml(error.message || 'Search is unavailable. Please try again.')}</div>`;
        announcement.textContent = 'Player search is temporarily unavailable.';
        openResults();
      }
    }
  }, 300);
});

function cancelSearch() {
  clearTimeout(debounceTimer);
  activeRequest += 1;
  searchController?.abort();
  closeResults();
}

clearSearch.addEventListener('click', () => {
  input.value = '';
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.focus();
});

document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.query;
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.focus();
}));

results.addEventListener('mousedown', event => event.preventDefault());
results.addEventListener('click', event => {
  const option = event.target.closest('.search-result');
  if (option) selectPlayer(option.dataset.id);
});

input.addEventListener('keydown', event => {
  if (event.key === 'Escape') { cancelSearch(); return; }
  const items = results.hidden ? [] : [...results.querySelectorAll('.search-result')];
  if (!items.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectedIndex = event.key === 'ArrowDown' ? Math.min(selectedIndex + 1, items.length - 1) : Math.max(selectedIndex - 1, 0);
    items.forEach((item, index) => item.setAttribute('aria-selected', String(index === selectedIndex)));
    input.setAttribute('aria-activedescendant', items[selectedIndex].id);
    items[selectedIndex].scrollIntoView({block:'nearest'});
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    selectPlayer(items[Math.max(0, selectedIndex)].dataset.id);
  }
});

input.addEventListener('blur', () => setTimeout(() => {
  if (!document.querySelector('.search-wrap').contains(document.activeElement)) cancelSearch();
}, 0));
document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) cancelSearch(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.querySelector('#scout').scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth'});
    input.focus({preventScroll:true});
  }
});

async function selectPlayer(id) {
  cancelSearch();
  predictionController?.abort();
  predictionController = new AbortController();
  const requestId = ++activePrediction;
  selectedPlayer = id;
  input.blur();
  emptyState.hidden = true;
  resultSection.hidden = false;
  resultSection.setAttribute('aria-busy', 'true');
  resultSection.innerHTML = '<div class="loading-result"><span class="loading-orbit" aria-hidden="true"></span><p>Reading the season.<br>Preparing your player’s valuation…</p></div>';
  resultSection.scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth', block:'nearest'});
  try {
    const response = await fetch(`/api/players/${encodeURIComponent(id)}/prediction`, {signal:predictionController.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not calculate this valuation.');
    if (requestId !== activePrediction) return;
    const features = data.features || {};
    const value = data.predictedValue == null || !Number.isFinite(Number(data.predictedValue)) ? 'Unavailable' : new Intl.NumberFormat('en-GB', {style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(data.predictedValue));
    input.value = data.name || input.value;
    clearSearch.hidden = !input.value;
    resultSection.innerHTML = `<article class="result-shell"><div class="result-header"><div class="result-main">${portrait(data.name, true)}<div><span class="result-kicker">PREMIER LEAGUE · ${escapeHtml(data.season)}</span><h3 class="result-title">${escapeHtml(data.name)}</h3><p class="result-sub">${escapeHtml(data.position || 'Player')} · Season snapshot</p></div></div><button type="button" class="result-close" data-dismiss>Clear result ×</button></div><div class="valuation-body"><div class="value-panel"><span class="value-label">Estimated market value</span><strong class="predicted-value">${value}</strong><span class="current-note">Experimental XGBoost estimate · EUR</span></div><dl class="stats-grid"><div><dt>Goals</dt><dd>${formatNumber(features.goals_12m)}</dd></div><div><dt>Assists</dt><dd>${formatNumber(features.assists_12m)}</dd></div><div><dt>Minutes played</dt><dd>${formatNumber(features.minutes_played_12m)}</dd></div><div><dt>Appearances</dt><dd>${formatNumber(features.games_12m)}</dd></div></dl></div><div class="data-context"><span>Performance totals: ${escapeHtml(data.statsSeasons)}</span><span>${escapeHtml(data.dataSource)}</span></div><details class="model-note"><summary>Understand this estimate</summary><p>These full-season totals may span close to two years. They are not the rolling 12-month inputs used in training. Age, height, appearances, and several other profile fields are unavailable, so treat this estimate as highly experimental. The model’s historical holdout median absolute percentage error was 47.9%; that score does not describe this incomplete input setup. This is a market-value estimate, not a transfer-fee prediction.</p></details></article>`;
  } catch (error) {
    if (requestId !== activePrediction || error.name === 'AbortError') return;
    console.error('Player valuation failed:', error.message);
    resultSection.innerHTML = '<div class="error-state" role="alert"><div><h3>The valuation is taking a break.</h3><p>We couldn’t prepare this estimate. Please try again in a moment. You can still explore another player.</p></div><button class="button button-moss" type="button" data-retry>Try again <span aria-hidden="true">↗</span></button></div>';
  } finally {
    if (requestId === activePrediction) resultSection.setAttribute('aria-busy', 'false');
  }
}

resultSection.addEventListener('click', event => {
  if (event.target.closest('[data-retry]') && selectedPlayer) selectPlayer(selectedPlayer);
  if (event.target.closest('[data-dismiss]')) {
    activePrediction += 1;
    predictionController?.abort();
    resultSection.hidden = true;
    resultSection.replaceChildren();
    emptyState.hidden = false;
    input.focus({preventScroll:true});
  }
});
