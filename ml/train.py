import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib
import mlflow
import os

print("🔥 Training started...")

df = pd.read_csv("../data/weather.csv")

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