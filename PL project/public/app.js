const input = document.querySelector('#player-search');
const results = document.querySelector('#search-results');
const resultSection = document.querySelector('#result');
const searchHint = document.querySelector('.search-hint');
let debounceTimer;
let activeRequest = 0;
let searchController;
let selectedIndex = -1;

async function updateSearchHint() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    if (!status.modelAvailable) searchHint.textContent = 'THE TRAINED MODEL FILE IS MISSING';
    else if (status.modelError) {
      searchHint.textContent = /missing (sklearn|pandas|xgboost|joblib)|No module named/i.test(status.modelError)
        ? 'PYTHON PACKAGES MISSING · INSTALL requirements.txt IN .venv'
        : 'PYTHON MODEL RUNTIME FAILED · RECREATE .venv WITH PYTHON 3.13';
    }
    else if (!status.modelReady) {
      searchHint.textContent = 'HISTORICAL PLAYER SEARCH · MODEL IS WARMING UP';
      setTimeout(updateSearchHint, 2500);
    } else searchHint.textContent = 'PREMIER LEAGUE DATA · SEASONS 2022/23–2026/27 · SEARCH PLAYER NAMES';
  } catch {}
}
updateSearchHint();

function safeImage(url, name, className) {
  if (!url) return `<span class="player-thumb fallback ${className}">${escapeHtml(name.slice(0, 1))}</span>`;
  return `<img class="player-thumb ${className}" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;player-thumb fallback ${className}&quot;>${escapeHtml(name.slice(0, 1))}</span>'">`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function money(value) {
  if (value == null) return 'Unavailable';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function renderResults(players, providerResults) {
  selectedIndex = -1;
  if (!players.length) {
    const detail = providerResults === 0
      ? 'No player matched that search in the historical Premier League data. Try a shorter name or check the spelling.'
      : 'Player data is temporarily unavailable. Please try again.';
    results.innerHTML = `<div class="no-results">${escapeHtml(detail)}</div>`;
    results.hidden = false;
    return;
  }
  results.innerHTML = players.map((player, i) => `<button class="search-result" role="option" aria-selected="false" data-index="${i}" data-id="${escapeHtml(player.id)}">${safeImage(player.image, player.name, '')}<span><span class="result-name">${escapeHtml(player.name)}</span><span class="result-meta">Premier League · ${escapeHtml(player.season)} · ${escapeHtml(player.position || 'Player')}</span></span><span class="result-arrow" aria-hidden="true">↗</span></button>`).join('');
  results.hidden = false;
}

input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const requestId = ++activeRequest;
  searchController?.abort();
  const query = input.value.trim();
  if (query.length < 3) { results.hidden = true; results.innerHTML = ''; return; }
  results.innerHTML = '<div class="no-results">Searching historical player data…</div>';
  results.hidden = false;
  debounceTimer = setTimeout(async () => {
    searchController = new AbortController();
    try {
      const response = await fetch(`/api/players?q=${encodeURIComponent(query)}`, { signal: searchController.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Player search failed.');
      if (requestId === activeRequest) renderResults(data.players || [], data.providerResults);
    } catch (error) {
      if (requestId === activeRequest && error.name !== 'AbortError') {
        results.innerHTML = `<div class="no-results">${escapeHtml(error.message || 'Search is unavailable. Please try again.')}</div>`;
        results.hidden = false;
      }
    }
  }, 400);
});

results.addEventListener('click', (event) => {
  const button = event.target.closest('.search-result');
  if (button) selectPlayer(button.dataset.id);
});

input.addEventListener('keydown', (event) => {
  const items = [...results.querySelectorAll('.search-result')];
  if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, items.length - 1); updateSelection(items); }
  if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); updateSelection(items); }
  if (event.key === 'Enter' && items.length) { event.preventDefault(); items[Math.max(0, selectedIndex)].click(); }
  if (event.key === 'Escape') results.hidden = true;
});

function updateSelection(items) {
  items.forEach((item, i) => { item.setAttribute('aria-selected', String(i === selectedIndex)); if (i === selectedIndex) item.scrollIntoView({ block: 'nearest' }); });
}

async function selectPlayer(id) {
  clearTimeout(debounceTimer);
  activeRequest += 1;
  searchController?.abort();
  results.hidden = true;
  input.blur();
  resultSection.hidden = false;
  resultSection.innerHTML = '<div class="no-results">Fetching historical season stats and running the XGBoost model…</div>';
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const response = await fetch(`/api/players/${encodeURIComponent(id)}/prediction`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not calculate a prediction.');
    const features = data.features || {};
    const valueMarkup = `<strong class="predicted-value">${money(data.predictedValue)}</strong><span class="current-note">Estimated market value · model output in EUR</span>`;
    resultSection.innerHTML = `<div class="result-shell"><div class="result-main">${safeImage(data.image, data.name, 'result-portrait')}<div><div class="result-kicker">XGBOOST MARKET VALUE ESTIMATE · ${escapeHtml(data.season)}</div><h2 class="result-title">${escapeHtml(data.name)}</h2><div class="result-sub">${escapeHtml(data.position || 'Player')} · Premier League · ${escapeHtml(data.season)}</div></div></div><div class="value-panel"><span class="value-label">MODEL PREDICTION</span>${valueMarkup}</div><div class="stats-grid"><div><span>GOALS</span><strong>${escapeHtml(features.goals_12m ?? '—')}</strong></div><div><span>ASSISTS</span><strong>${escapeHtml(features.assists_12m ?? '—')}</strong></div><div><span>MINUTES</span><strong>${new Intl.NumberFormat('en-GB').format(features.minutes_played_12m || 0)}</strong></div><div><span>APPEARANCES</span><strong>${escapeHtml(features.games_12m ?? '—')}</strong></div></div><p class="model-note">${escapeHtml(data.model)} · Performance totals from ${escapeHtml(data.dataSource)}, seasons ${escapeHtml(data.statsSeasons)}. These full-season totals can span close to two years and are not equivalent to the model’s rolling 12-month training inputs. This dataset lacks several model inputs, including age, height, and appearances, so treat the estimate as highly experimental. The model’s historical holdout median absolute percentage error was 47.9%; that score does not describe this incomplete input setup. This is an estimate, not a transfer-fee prediction.</p></div>`;
  } catch (error) { resultSection.innerHTML = `<p class="error-note">${escapeHtml(error.message)}</p>`; }
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) results.hidden = true;
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.focus(); }
});
