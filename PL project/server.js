const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || (process.env[match[1]] !== undefined && process.env[match[1]] !== '')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}
loadLocalEnv();
const DATA_BASE = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data';
const SEASONS = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const VENV_PYTHON = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
function venvHasPythonBase() {
  if (!fs.existsSync(VENV_PYTHON)) return false;
  const configPath = path.join(ROOT, '.venv', 'pyvenv.cfg');
  if (!fs.existsSync(configPath)) return true;
  const home = fs.readFileSync(configPath, 'utf8').match(/^home\s*=\s*(.+)$/mi)?.[1]?.trim();
  return !home || fs.existsSync(path.join(home, 'python.exe')) || fs.existsSync(path.join(home, 'python3.exe'));
}
function configuredPythonExists(command) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  if (command.includes('/') || command.includes('\\')) return fs.existsSync(path.resolve(ROOT, command));
  return true;
}
const ENV_PYTHON = process.env.PYTHON?.trim();
const PYTHON = configuredPythonExists(ENV_PYTHON)
  ? ENV_PYTHON
  : venvHasPythonBase() ? VENV_PYTHON : 'python';
const modelAvailable = fs.existsSync(path.join(ROOT, 'models', 'pl_value_model_xgboost_retrained.joblib'));
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const apiCache = new Map();

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); if (row.some((cell) => cell !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function seasonPlayers(season) {
  const url = `${DATA_BASE}/${season}/cleaned_players.csv`;
  const cached = apiCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Historical player data for ${season} is unavailable (HTTP ${response.status}).`);
    const players = parseCsv(await response.text()).map((player) => ({ ...player, season }));
    if (!players.length || !('first_name' in players[0]) || !('second_name' in players[0])) {
      throw new Error(`Historical player data for ${season} has an unexpected format.`);
    }
    return players;
  })();
  apiCache.set(url, { promise, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  try { return await promise; }
  catch (error) { if (apiCache.get(url)?.promise === promise) apiCache.delete(url); throw error; }
}

function normalizedName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j];
  }
  return prev[b.length];
}

function playerMatches(player, query) {
  const search = normalizedName(query);
  const name = normalizedName(`${player.first_name} ${player.second_name}`);
  if (name.includes(search)) return true;
  const parts = name.split(' ');
  const terms = search.split(' ').filter(Boolean);
  return terms.length > 0 && terms.every((term) => parts.some((part) => part.startsWith(term) || (term.length >= 5 && editDistance(part, term) <= 1)));
}

function rowSummary(player) {
  const name = `${player.first_name} ${player.second_name}`.trim();
  const position = ({ GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Attacker' })[player.element_type] || 'Player';
  return { id: `${player.season}:${normalizedName(name)}`, name, age: null, country: '', height: '', image: '', club: '', position, subPosition: '', foot: '', league: 'Premier League', season: player.season };
}

let modelWorker;
let modelWorkerStart;
let modelWorkerReady = false;
let modelWorkerError = '';
let modelWorkerBuffer = '';
let modelWorkerStderr = '';
const pendingPredictions = [];

function rejectPendingPredictions(error) {
  while (pendingPredictions.length) pendingPredictions.shift().reject(error);
}

function ensureModelWorker() {
  if (modelWorker && !modelWorker.killed) return Promise.resolve(modelWorker);
  if (modelWorkerStart) return modelWorkerStart;
  modelWorkerError = '';
  modelWorkerStart = new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, 'predict.py'), '--worker'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let didSpawn = false;
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      modelWorkerBuffer += chunk;
      let newline;
      while ((newline = modelWorkerBuffer.indexOf('\n')) !== -1) {
        const line = modelWorkerBuffer.slice(0, newline).trim();
        modelWorkerBuffer = modelWorkerBuffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); }
        catch { pendingPredictions.shift()?.reject(new Error('The model worker returned invalid output.')); continue; }
        if (message.ready) { modelWorkerReady = true; continue; }
        const pending = pendingPredictions.shift();
        if (!pending) continue;
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error(message.error || 'The model prediction failed.'));
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { modelWorkerStderr = (modelWorkerStderr + chunk).slice(-4000); });
    child.once('spawn', () => { didSpawn = true; modelWorker = child; resolve(child); });
    child.once('error', (error) => {
      const detail = `Could not start Python (${PYTHON}): ${error.message}`;
      modelWorker = null; modelWorkerStart = null; modelWorkerReady = false;
      modelWorkerError = detail;
      if (!didSpawn) reject(new Error(detail));
      rejectPendingPredictions(new Error(detail));
    });
    child.once('close', (code) => {
      const detail = modelWorkerStderr.trim() || modelWorkerError || `The model worker exited with code ${code}.`;
      const missingDependency = detail.match(/No module named ['"]?(sklearn|pandas|xgboost|joblib)/i);
      const brokenVenv = /did not find executable at|cannot find the path specified/i.test(detail);
      const error = missingDependency
        ? new Error(`The selected Python (${PYTHON}) is missing ${missingDependency[1]}. Install packages with: "${PYTHON}" -m pip install -r requirements.txt`)
        : brokenVenv
          ? new Error('The project virtual environment points to a Python installation that is no longer available. Recreate .venv using your installed Python 3.13, then install requirements.txt again.')
          : new Error(detail);
      modelWorker = null; modelWorkerStart = null; modelWorkerReady = false; modelWorkerBuffer = ''; modelWorkerStderr = '';
      modelWorkerError = error.message;
      rejectPendingPredictions(error);
      if (!didSpawn) reject(error);
    });
  });
  return modelWorkerStart;
}

async function modelPrediction(features) {
  const child = await ensureModelWorker();
  if (!child.stdin.writable) throw new Error('The model worker is not accepting requests. Restart the server and try again.');
  if (pendingPredictions.length >= 25) throw new Error('The prediction queue is full. Wait a moment and try again.');
  return new Promise((resolve, reject) => {
    const pending = { resolve, reject, timer: null };
    pending.timer = setTimeout(() => reject(new Error('Model prediction timed out. Try again.')), 180000);
    pendingPredictions.push(pending);
    child.stdin.write(`${JSON.stringify(features)}\n`, (error) => {
      if (!error) return;
      clearTimeout(pending.timer);
      pending.settled = true;
      reject(new Error(`Could not send input to model worker: ${error.message}`));
    });
  });
}

async function predictPlayer(id) {
  const separator = id.indexOf(':');
  const season = id.slice(0, separator);
  const wantedName = id.slice(separator + 1);
  if (!SEASONS.includes(season) || !wantedName) throw new Error('Invalid historical player selection. Search again.');
  const index = SEASONS.indexOf(season);
  const [currentRows, priorRows] = await Promise.all([
    seasonPlayers(season),
    index > 0 ? seasonPlayers(SEASONS[index - 1]) : Promise.resolve([]),
  ]);
  const findPlayer = (rows) => rows.find((row) => normalizedName(`${row.first_name} ${row.second_name}`) === wantedName);
  const current = findPlayer(currentRows);
  const prior = findPlayer(priorRows);
  if (!current && !prior) throw new Error('No historical stats were returned for this player.');
  const player = current || prior;
  const profile = rowSummary({ ...player, season: current ? season : SEASONS[index - 1] });
  const sum = (key) => (Number(current?.[key]) || 0) + (Number(prior?.[key]) || 0);
  const minutes = sum('minutes');
  const games = null;
  const features = {
    age: null,
    height_in_cm: null,
    goals_12m: sum('goals_scored'), assists_12m: sum('assists'), minutes_played_12m: minutes,
    yellow_cards_12m: sum('yellow_cards'), red_cards_12m: sum('red_cards'), games_12m: games,
    minutes_per_game: null,
    position: ({ Goalkeeper: 'Goalkeeper', Defender: 'Defender', Midfielder: 'Midfield', Attacker: 'Attack' })[profile.position] || profile.position || null,
    sub_position: null, foot: null, country_of_citizenship: null, current_club_name: null,
  };
  const prediction = await modelPrediction(features);
  return {
    ...profile,
    predictedValue: prediction.predicted_value_eur,
    model: 'XGBoost market-value model',
    dataSource: 'Fantasy Premier League historical dataset',
    statsSeasons: prior ? `${SEASONS[index - 1]} and ${season}` : season,
    statsWindowNote: 'Inputs are totals from the selected and preceding seasons, not a rolling 12-month window. Age, height, appearances, foot, citizenship, and club are unavailable in this dataset.',
    features,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/status' && req.method === 'GET') {
    return sendJson(res, { provider: 'FPL historical datasets', configured: true, modelAvailable, modelReady: modelWorkerReady, modelError: modelWorkerError, seasons: SEASONS });
  }
  if (url.pathname === '/api/players' && req.method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim();
    if (query.length > 80) return sendJson(res, { error: 'Search text must be 80 characters or fewer.' }, 400);
    if (query.length < 3) return sendJson(res, { players: [] });
    try {
      const seasonRows = await Promise.all(SEASONS.map((season) => seasonPlayers(season)));
      const candidates = seasonRows.flat().filter((player) => playerMatches(player, query));
      const latestByName = new Map();
      for (const player of candidates) {
        const key = normalizedName(`${player.first_name} ${player.second_name}`);
        const existing = latestByName.get(key);
        if (!existing || SEASONS.indexOf(player.season) > SEASONS.indexOf(existing.season)) latestByName.set(key, player);
      }
      const premierLeaguePlayers = [...latestByName.values()].sort((a, b) => Number(b.minutes) - Number(a.minutes));
      return sendJson(res, {
        players: premierLeaguePlayers.slice(0, 10).map((item) => ({ ...rowSummary(item), stats: { minutes: Number(item.minutes) || 0, goals: Number(item.goals_scored) || 0, assists: Number(item.assists) || 0 } })),
        providerResults: candidates.length,
        seasons: SEASONS,
      });
    } catch (error) { return sendJson(res, { error: error.message }, 502); }
  }
  const playerMatch = url.pathname.match(/^\/api\/players\/([^/]+)\/prediction$/);
  if (playerMatch && req.method === 'GET') {
    if (!modelAvailable) return sendJson(res, { error: 'The trained XGBoost model file is missing.' }, 503);
    try { return sendJson(res, await predictPlayer(decodeURIComponent(playerMatch[1]))); }
    catch (error) { return sendJson(res, { error: error.message }, 502); }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(res, { error: 'Not found' }, 404);
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(PUBLIC, requested);
  if (!file.startsWith(`${PUBLIC}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT) || 3001;
server.listen(port, () => {
  console.log(`Premier League XGBoost Player Value running at http://localhost:${port} (historical FPL seasons: ${SEASONS.join(', ')})`);
  ensureModelWorker().catch((error) => console.error(`Model worker could not start: ${error.message}`));
});

process.once('SIGINT', () => {
  modelWorker?.kill();
  rejectPendingPredictions(new Error('Server is shutting down.'));
  server.close(() => process.exit(0));
});
