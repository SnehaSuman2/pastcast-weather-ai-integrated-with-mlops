import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib
import mlflow
import mlflow.sklearn
import os

mlflow.set_tracking_uri("file:./mlruns")

print("🔥 Training started...")

# Load dataset
current_dir = os.path.dirname(__file__)
data_path = os.path.join(current_dir, "..", "data", "weather.csv")

df = pd.read_csv(data_path)

X = df[["temp", "humidity"]]
y = df["rain"]

with mlflow.start_run():

    # Create model
    model = RandomForestClassifier(n_estimators=100)

    # ✅ Log parameters
    mlflow.log_param("model_type", "RandomForest")
    mlflow.log_param("n_estimators", 100)

    # Train model
    model.fit(X, y)

    # Calculate accuracy
    acc = model.score(X, y)

    # ✅ Log metric
    mlflow.log_metric("accuracy", acc)

    # ✅ Log model in MLflow
    mlflow.sklearn.log_model(model, "model")

    # ✅ Model versioning (local storage)
    model_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(model_dir, exist_ok=True)

    existing_models = [f for f in os.listdir(model_dir) if f.startswith("model_v")]
    version = len(existing_models) + 1

    model_path = os.path.join(model_dir, f"model_v{version}.pkl")
    joblib.dump(model, model_path)

    print(f"✅ Model saved as version v{version}: {model_path}")