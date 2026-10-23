"""Check serverless API contracts with deterministic data; no model packages needed."""

import importlib.util
import math
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


sys.modules.setdefault("joblib", SimpleNamespace(load=lambda path: None))
sys.modules["pandas"] = SimpleNamespace(DataFrame=lambda rows, columns: rows)
source = Path(__file__).resolve().parents[1] / "api" / "index.py"
spec = importlib.util.spec_from_file_location("vercel_api", source)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def row(season, **stats):
    return {"first_name": "Bukayo", "second_name": "Saka", "season": season,
            "element_type": "MID", "minutes": "1000", "goals_scored": "5",
            "assists": "4", "yellow_cards": "2", "red_cards": "0", **stats}


class ServerlessApiTests(unittest.TestCase):
    def test_csv_position_codes_and_accent_normalization(self):
        self.assertEqual(api._summary(row("2025-26"))["position"], "Midfielder")
        self.assertEqual(api._normalize("Raya Martín"), "raya martin")
        self.assertTrue(api._matches(row("2025-26"), "sakka"))

    def test_search_keeps_latest_season_and_statistics(self):
        with patch.object(api, "_season_players", side_effect=lambda season: [row(season)]):
            result = api._players("Saka")
        self.assertEqual(len(result["players"]), 1)
        self.assertEqual(result["players"][0]["season"], "2026-27")
        self.assertEqual(result["players"][0]["stats"]["goals"], 5)

    def test_prediction_uses_two_seasons_and_model_position(self):
        captured = []
        def predict(frame):
            captured.extend(frame)
            return [math.log1p(12_000_000)]
        with patch.object(api, "_season_players", side_effect=lambda season: [row(season)]), \
             patch.object(api, "_load_model", return_value=SimpleNamespace(predict=predict)):
            result = api._predict("2025-26:bukayo saka")
        self.assertEqual(result["predictedValue"], 12_000_000)
        self.assertEqual(captured[0]["goals_12m"], 10)
        self.assertEqual(captured[0]["position"], "Midfield")
        self.assertIsNone(captured[0]["age"])

    def test_invalid_selection_does_not_download_data(self):
        with patch.object(api, "_season_players") as fetch:
            with self.assertRaises(ValueError):
                api._predict("1999-00:invalid")
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
