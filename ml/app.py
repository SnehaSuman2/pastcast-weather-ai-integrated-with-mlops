from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import os

app = FastAPI()

model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
model = joblib.load(model_path)

class InputData(BaseModel):
    temp: float
    humidity: float

@app.get("/")
def home():
    return {"message": "ML API running"}

@app.post("/predict")
def predict(data: InputData):
    pred = model.predict([[data.temp, data.humidity]])
    return {"prediction": int(pred[0])}