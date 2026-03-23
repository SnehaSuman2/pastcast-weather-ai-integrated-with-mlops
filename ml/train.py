import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib
import mlflow
import os

print("🔥 Training started...")

data = {
    "temp": [30, 25, 20, 15],
    "humidity": [70, 60, 80, 90],
    "rain": [1, 0, 1, 1]
}

df = pd.DataFrame(data)

X = df[["temp", "humidity"]]
y = df["rain"]

with mlflow.start_run():
    model = RandomForestClassifier()
    model.fit(X, y)

    acc = model.score(X, y)
    mlflow.log_metric("accuracy", acc)

    path = os.path.join(os.path.dirname(__file__), "model.pkl")
    joblib.dump(model, path)

    print("✅ Model saved at:", path)