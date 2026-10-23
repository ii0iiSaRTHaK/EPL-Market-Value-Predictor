"""Vercel Python entrypoint for the existing player search and model API."""

import csv
import io
import json
import math
import re
import unicodedata
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import urlopen

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "pl_value_model_xgboost_retrained.joblib"
DATA_BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"
SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
FEATURES = [
    "age", "height_in_cm", "goals_12m", "assists_12m", "minutes_played_12m",
    "yellow_cards_12m", "red_cards_12m", "games_12m", "minutes_per_game",
    "position", "sub_position", "foot", "country_of_citizenship", "current_club_name",
]
_season_cache = {}
_model = None


def _json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _normalize(name):
    value = unicodedata.normalize("NFD", name)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", value.lower())).strip()


def _season_players(season):
    cached = _season_cache.get(season)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    url = f"{DATA_BASE}/{season}/cleaned_players.csv"
    try:
        with urlopen(url, timeout=20) as response:
            text = response.read().decode("utf-8-sig")
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError(f"Historical player data for {season} is unavailable: {error}") from error
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows or "first_name" not in rows[0] or "second_name" not in rows[0]:
        raise RuntimeError(f"Historical player data for {season} has an unexpected format.")
    for row in rows:
        row["season"] = season
    _season_cache[season] = (time.monotonic() + 6 * 60 * 60, rows)
    return rows


def _summary(player):
    name = f"{player.get('first_name', '')} {player.get('second_name', '')}".strip()
    positions = {"GK": "Goalkeeper", "DEF": "Defender", "MID": "Midfielder", "FWD": "Attacker", "1": "Goalkeeper", "2": "Defender", "3": "Midfielder", "4": "Attacker"}
    return {
        "id": f"{player['season']}:{_normalize(name)}", "name": name,
        "age": None, "country": "", "height": "", "image": "", "club": "",
        "position": positions.get(str(player.get("element_type", "")), "Player"),
        "subPosition": "", "foot": "", "league": "Premier League", "season": player["season"],
    }


def _distance(left, right):
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


def _matches(player, query):
    search = _normalize(query)
    name = _normalize(f"{player.get('first_name', '')} {player.get('second_name', '')}")
    if search in name:
        return True
    parts = name.split()
    terms = search.split()
    return bool(terms) and all(
        any(part.startswith(term) or (len(term) >= 5 and _distance(part, term) <= 1) for part in parts)
        for term in terms
    )


def _players(query):
    with ThreadPoolExecutor(max_workers=len(SEASONS)) as pool:
        season_rows = pool.map(_season_players, SEASONS)
        candidates = [player for rows in season_rows for player in rows if _matches(player, query)]
    latest = {}
    for player in candidates:
        key = _normalize(f"{player.get('first_name', '')} {player.get('second_name', '')}")
        if key not in latest or SEASONS.index(player["season"]) > SEASONS.index(latest[key]["season"]):
            latest[key] = player
    ordered = sorted(latest.values(), key=lambda row: float(row.get("minutes") or 0), reverse=True)
    result = []
    for player in ordered[:10]:
        item = _summary(player)
        item["stats"] = {
            "minutes": float(player.get("minutes") or 0),
            "goals": float(player.get("goals_scored") or 0),
            "assists": float(player.get("assists") or 0),
        }
        result.append(item)
    return {"players": result, "providerResults": len(candidates), "seasons": SEASONS}


def _load_model():
    global _model
    if _model is None:
        artifact = joblib.load(MODEL_PATH)
        _model = artifact["primary_model"]
    return _model


def _predict(player_id):
    if not MODEL_PATH.is_file():
        raise RuntimeError("The trained XGBoost model file is missing.")
    season, separator, wanted_name = player_id.partition(":")
    if not separator or season not in SEASONS or not wanted_name:
        raise ValueError("Invalid historical player selection. Search again.")
    index = SEASONS.index(season)
    current_rows = _season_players(season)
    prior_rows = _season_players(SEASONS[index - 1]) if index > 0 else []

    def find(rows):
        return next((row for row in rows if _normalize(f"{row.get('first_name', '')} {row.get('second_name', '')}") == wanted_name), None)

    current, prior = find(current_rows), find(prior_rows)
    if not current and not prior:
        raise ValueError("No historical stats were returned for this player.")
    selected = current or prior
    profile = _summary({**selected, "season": season if current else SEASONS[index - 1]})

    def total(key):
        return float((current or {}).get(key) or 0) + float((prior or {}).get(key) or 0)

    positions = {"Goalkeeper": "Goalkeeper", "Defender": "Defender", "Midfielder": "Midfield", "Attacker": "Attack"}
    features = {
        "age": None, "height_in_cm": None, "goals_12m": total("goals_scored"),
        "assists_12m": total("assists"), "minutes_played_12m": total("minutes"),
        "yellow_cards_12m": total("yellow_cards"), "red_cards_12m": total("red_cards"),
        "games_12m": None, "minutes_per_game": None,
        "position": positions.get(profile["position"], profile["position"]),
        "sub_position": None, "foot": None, "country_of_citizenship": None,
        "current_club_name": None,
    }
    frame = pd.DataFrame([{name: features.get(name) for name in FEATURES}], columns=FEATURES)
    prediction = max(math.expm1(float(_load_model().predict(frame)[0])), 0.0)
    return {
        **profile, "predictedValue": round(prediction), "model": "XGBoost market-value model",
        "dataSource": "Fantasy Premier League historical dataset",
        "statsSeasons": f"{SEASONS[index - 1]} and {season}" if prior else season,
        "statsWindowNote": "Inputs are totals from the selected and preceding seasons, not a rolling 12-month window. Age, height, appearances, foot, citizenship, and club are unavailable in this dataset.",
        "features": features,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = urlparse(self.path)
        path = unquote(route.path)
        try:
            if path == "/api/status":
                _json(self, {
                    "provider": "FPL historical datasets", "configured": True,
                    "modelAvailable": MODEL_PATH.is_file(), "modelReady": _model is not None,
                    "modelError": "", "seasons": SEASONS,
                })
            elif path == "/api/players":
                query = parse_qs(route.query).get("q", [""])[0].strip()
                if len(query) > 80:
                    _json(self, {"error": "Search text must be 80 characters or fewer."}, 400)
                elif len(query) < 3:
                    _json(self, {"players": []})
                else:
                    _json(self, _players(query))
            else:
                match = re.fullmatch(r"/api/players/([^/]+)/prediction", path)
                if match:
                    _json(self, _predict(match.group(1)))
                elif path.startswith("/api/"):
                    _json(self, {"error": "Not found"}, 404)
                else:
                    _json(self, {"error": "Not found"}, 404)
        except ValueError as error:
            _json(self, {"error": str(error)}, 400)
        except Exception as error:
            _json(self, {"error": str(error)}, 502)

    def log_message(self, _format, *_args):
        return

