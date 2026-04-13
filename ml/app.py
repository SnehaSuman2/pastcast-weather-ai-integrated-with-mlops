import csv
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import os

app = FastAPI()

model_dir = os.path.join(os.path.dirname(__file__), "models")

models = sorted([f for f in os.listdir(model_dir) if f.startswith("model_v")])

latest_model = models[-1]

model_path = os.path.join(model_dir, latest_model)

model = joblib.load(model_path)

def log_prediction(temp, humidity, prediction):
    log_file = os.path.join(os.path.dirname(__file__), "logs.csv")

    file_exists = os.path.isfile(log_file)

    with open(log_file, mode='a', newline='') as file:
        writer = csv.writer(file)

        # Write header if file is new
        if not file_exists:
            writer.writerow(["timestamp", "temp", "humidity", "prediction"])

        writer.writerow([datetime.now(), temp, humidity, prediction])

class InputData(BaseModel):
    temp: float
    humidity: float

@app.get("/")
def home():
    return {"message": "ML API running"}

@app.post("/predict")
def predict(data: InputData):
    pred = model.predict([[data.temp, data.humidity]])
    result = int(pred[0])

    # ✅ LOGGING
    log_prediction(data.temp, data.humidity, result)

    return {"prediction": result}