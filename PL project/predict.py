"""Read one feature row from stdin and run the saved XGBoost candidate."""

import json
import math
import sys
from pathlib import Path

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "pl_value_model_xgboost_retrained.joblib"
FEATURES = [
    "age", "height_in_cm", "goals_12m", "assists_12m", "minutes_played_12m",
    "yellow_cards_12m", "red_cards_12m", "games_12m", "minutes_per_game",
    "position", "sub_position", "foot", "country_of_citizenship", "current_club_name",
]


def predict(row, model):
    frame = pd.DataFrame([{name: row.get(name) for name in FEATURES}], columns=FEATURES)
    predicted_log = float(model.predict(frame)[0])
    predicted_value = max(math.expm1(predicted_log), 0.0)
    return {"predicted_value_eur": round(predicted_value)}


def main():
    artifact = joblib.load(MODEL_PATH)
    model = artifact["primary_model"]
    if "--worker" in sys.argv:
        print(json.dumps({"ready": True}), flush=True)
        for line in sys.stdin:
            try:
                row = json.loads(line)
                result = predict(row, model)
                print(json.dumps({"ok": True, "result": result}), flush=True)
            except Exception as error:
                print(json.dumps({"ok": False, "error": str(error)}), flush=True)
        return
    row = json.load(sys.stdin)
    print(json.dumps(predict(row, model)))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Model inference error: {error}", file=sys.stderr)
        raise SystemExit(1)
