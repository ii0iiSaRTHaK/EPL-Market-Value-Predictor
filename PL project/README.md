# Premier League Player Value

A Premier League player search and market-value estimator. Player names and season totals are fetched from public historical Fantasy Premier League CSV datasets hosted by [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League). Selected players are scored by the saved XGBoost model in `models/pl_value_model_xgboost_retrained.joblib`.

## Setup

The redesigned interface uses the exact ThreeUI Sylva Living Green source. See [UI-IMPLEMENTATION.md](UI-IMPLEMENTATION.md) for its provenance, build commands, and verification notes. The current frontend build is included; run `npm ci` and `npm run build` when changing UI source.

Requires Node.js 18+ and Python 3.13. No provider API key is needed. Create a project-local Python environment and install the model packages into it:

```powershell
python --version # confirm Python 3.13
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
node server.js
```

The server automatically uses `.venv\Scripts\python.exe` when it exists. If you already have a different environment, set `PYTHON` to that environment's Python executable before starting Node; install requirements with that same executable using `-m pip install -r requirements.txt`.

Python virtual environments contain an absolute path to the Python installation that created them. Recreate `.venv` on the machine where the server runs if that base Python installation is moved or removed.

Then open [http://localhost:3001](http://localhost:3001). The server fetches and caches season CSVs from 2022/23 through the current 2026/27 snapshot directly from the public dataset repository. Set `PYTHON` to select a specific Python executable if needed.

The upstream repository documents the player season files and their fields in its [data dictionary](https://github.com/vaastav/Fantasy-Premier-League/blob/master/DATA_DICTIONARY.md). Dataset downloads are cached in memory for six hours. This is historical season data rather than live match data.

## Prediction flow

`GET /api/players?q=<name>` searches the external season datasets. `GET /api/players/<season:name>/prediction` combines that season and the preceding season when available, assembles the model feature columns, and sends them to `predict.py`. The script loads the XGBoost artifact and converts its `log1p` output back to euros. No latest-value carry-forward is used.

The training feature set includes age, height, goals, assists, minutes, cards, appearances, position, foot, citizenship and club. The external season snapshots include goals, assists, minutes, cards, and position; other fields are unavailable and left for the model's preprocessing to handle. Season totals approximate the historical model's rolling 365-day performance features, and are not a precise rolling-year window. These missing fields and differences can affect predictions.

The saved XGBoost candidate was evaluated on a chronological holdout through June 2026. Its test median absolute percentage error was 47.9%, with RMSE about €14.4m. These figures are descriptive of that holdout, not a promise of accuracy on current live data. A market-value estimate is not a transfer-fee prediction.

## Data and model files

Project layout: `data/` contains the downloaded CSV snapshots, `notebooks/` contains the training notebooks, `models/` contains saved model artifacts, and `reports/` contains evaluation JSON and exported weights. The live app no longer reads the CSV snapshots to search for players or produce a displayed prediction. Retrain and replace the XGBoost artifact separately when you are ready to improve the model.
