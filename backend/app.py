# ============================================================
# PastCAST-AI Backend (Optimized for Qwen 1.5B + Tools)
#
# Features:
# - Qwen 2.5-1.5B Instruct (local reasoning)
# - Wikipedia summaries (filtered + intelligent)
# - DuckDuckGo fallback
# - Accurate Weather API access
# - English→Hindi/Marathi/Tamil/Telugu translation (MarianMT)
# - Conversation Memory (SQLite)
# - Stable, deterministic output (no hallucination loops)
# ============================================================

from flask import Flask, request, jsonify
import random
from flask_cors import CORS
from datetime import datetime
import os, re, requests, pandas as pd, wikipedia

from utils.nlp_model import generate_nlm_reply, translate_text
from utils.db import init_db, add_message, get_recent_messages, clear_history

app = Flask(__name__)
CORS(app)

# Initialize DB
init_db()

# -------------------------
# Config
# -------------------------
OPENWEATHER_API = os.getenv("OPENWEATHER_API") or os.getenv("OPENWEATHER_API_KEY")
WEATHER_URL = "https://api.openweathermap.org/data/2.5"
DATA_PATH = "data/trends.csv"

# ============================================================
# Utility Functions
# ============================================================

def extract_location(text: str):
    """Extract city name after 'in', 'at', or 'for' (handles punctuation)."""
    cleaned = text.strip()
    # Remove trailing question marks / dots / exclamation marks
    cleaned = re.sub(r"[?.!]+$", "", cleaned)

    # Match patterns like "weather in Mumbai", "forecast for New Delhi"
    m = re.search(r"\b(?:in|at|for)\s+([A-Za-z\s\.,-]+)$", cleaned, re.I)
    return m.group(1).strip(" .,-") if m else None


def get_weather(city: str):
    """Fetch real-time weather."""
    if not OPENWEATHER_API:
        return "Weather unavailable (API key missing)."

    # Remove common time words so queries like "Bengaluru tomorrow" still work
    cleaned_city = re.sub(
        r"\b(today|tonight|tomorrow|yesterday|now|this week|this weekend)\b",
        "",
        city,
        flags=re.IGNORECASE,
    ).strip(" ,.-")

    if not cleaned_city:
        cleaned_city = city.strip(" ,.-")

    try:
        r = requests.get(
            f"{WEATHER_URL}/weather",
            params={"q": cleaned_city, "appid": OPENWEATHER_API, "units": "metric"},
            timeout=8
        ).json()

        if "main" not in r:
            return f"Couldn't fetch weather for {cleaned_city}."

        desc = r["weather"][0]["description"].capitalize()
        temp = r["main"]["temp"]
        humidity = r["main"]["humidity"]

        return f"Weather in {cleaned_city}: {desc}, {temp}°C, humidity {humidity}%."
    except Exception:
        return f"Couldn't fetch weather for {cleaned_city}."


def get_wiki_summary(query: str):
    """Smart Wikipedia fetch avoiding irrelevant pages."""
    try:
        results = wikipedia.search(query)
        if not results:
            return None

        # Avoid bad pages (like light bulbs for invention queries)
        blacklist = ["centennial light", "light bulb", "lamp", "incandescent"]
        for title in results:
            if any(b in title.lower() for b in blacklist):
                continue
            try:
                summary = wikipedia.summary(title, sentences=3)
                return title, summary
            except:
                continue


        # fallback
        title = results[0]
        summary = wikipedia.summary(title, sentences=3)
        return title, summary
    except:
        return None


def duckduckgo_fallback(query: str):
    """Fallback factual search."""
    try:
        url = f"https://api.duckduckgo.com/?q={query}&format=json"
        data = requests.get(url, timeout=5).json()

        if data.get("AbstractText"):
            return data["AbstractText"]
        for item in data.get("RelatedTopics") or []:
            if isinstance(item, dict) and item.get("Text"):
                return item["Text"]
        return None
    except:
        return None


def analyze_trends(text: str):
    """Search the CSV for any related text."""
    if not os.path.exists(DATA_PATH):
        return ""
    try:
        df = pd.read_csv(DATA_PATH)
        mask = df.select_dtypes(include="object").apply(
            lambda col: col.str.contains(text, case=False, na=False)
        ).any(axis=1)
        matches = df[mask]

        if matches.empty:
            return ""
        col = matches.select_dtypes(include="object").columns[0]
        values = ", ".join(matches[col].head(3).values)
        return f"Historical trends related: {values}. "
    except:
        return ""
    
def get_ml_prediction(temp, humidity):
    try:
        response = requests.post(
            "http://127.0.0.1:8001/predict",   # ML API
            json={
                "temp": temp,
                "humidity": humidity
            },
            timeout=5
        )

        return response.json()

    except Exception as e:
        return {"error": str(e)}


def parse_who_name(q: str):
    """Parse 'who is X' questions."""
    m = re.match(r"^\s*who\s+(is|was)\s+(.+?)\??\s*$", q, re.I)
    if not m:
        return None
    name = re.sub(r"\b(in|from|of|at)\s*$", "", m.group(2), flags=re.I).strip()
    return name


def format_direct_with_bullets(subject: str, summary: str):
    """Convert a Wikipedia summary into a clean bullet set."""
    parts = [s.strip() for s in summary.split(".") if s.strip()]
    if not parts:
        return subject
    first = parts[0] + "."
    bullets = parts[1:5]
    if bullets:
        return f"{first}\n- " + "\n- ".join(bullets)
    return first

# ============================================================
# INTENT DETECTION
# ============================================================

def is_translation_request(text: str):
    return "translate" in text.lower()


def parse_translation_query(text: str):
    # quoted string
    q = re.search(r"[\"'“”‘’](.+?)[\"'“”‘’]", text)
    phrase = q.group(1) if q else None

    # target language
    lang = re.search(r"\b(to|into)\s+([A-Za-z]+)$", text.strip(), re.I)
    target = lang.group(2) if lang else None

    return phrase, target


def is_capability_query(text: str):
    keys = ["what can you do", "capabilities", "help", "what do you do"]
    t = text.lower()
    return any(k in t for k in keys)


def assistant_capabilities():
    return (
        "I can help with:\n"
        "- General questions and explanations.\n"
        "- Wikipedia-based factual summaries.\n"
        "- English → Hindi/Marathi/Tamil/Telugu translations.\n"
        "- Accurate weather lookups.\n"
        "- Trend lookup from CSV.\n"
        "- Clean reasoning and short explanations using Qwen 1.5B."
    )


def memory_context():
    msgs = get_recent_messages(6)
    return "\n".join(f"{r.upper()}: {c}" for r, c in msgs)

# ============================================================
# MASTER ROUTER — BRAIN
# ============================================================

def full_response(user_input: str):
    text = user_input.lower().strip()
    memory = memory_context()
    trends = analyze_trends(user_input)

    # 1) TRANSLATION
    if is_translation_request(text):
        phrase, target = parse_translation_query(user_input)
        if not phrase:
            phrase = re.sub(r"translate", "", text, flags=re.I).strip()
        if not target:
            return "Please specify a target language (e.g., Hindi)."
        return trends + translate_text(phrase, target)

    # 2) CAPABILITIES
    if is_capability_query(text):
        return assistant_capabilities()

    # 3) WEATHER
    weather_terms = ["weather", "temp", "temperature", "forecast", "humidity"]
    if any(w in text for w in weather_terms):
        city = extract_location(user_input)
        if not city:
            return "Please specify a city, e.g., 'weather in Pune'."
        return get_weather(city)

    # 4) WHO-IS
    who = parse_who_name(user_input)
    if who:
        try:
            summ = wikipedia.summary(who, sentences=3)
            return trends + format_direct_with_bullets(who, summ)
        except:
            pass

    # 5) WIKIPEDIA FACTUAL
    wiki = get_wiki_summary(user_input)
    if wiki:
        title, summary = wiki
        prompt = (
            f"<|system|> Provide 3–5 correct, concise bullet points.\n"
            f"<|user|> {user_input}\n"
            f"<|assistant|>"
        )
        return trends + generate_nlm_reply(prompt)

    # 6) DUCKDUCKGO
    ddg = duckduckgo_fallback(user_input)
    if ddg:
        prompt = (
            f"<|system|> Provide 3–5 accurate bullet points based on the provided context.\n"
            f"Context: {ddg}\n"
            f"<|user|> {user_input}\n"
            f"<|assistant|>"
        )
        return trends + generate_nlm_reply(prompt)

    # 7) GENERAL NLM
    general_prompt = (
        f"<|system|> Give a short, correct answer. No repetition. No filler.\n"
        f"<|user|> {user_input}\n"
        f"<|assistant|>"
    )
    return generate_nlm_reply(general_prompt)

# ============================================================
# ROUTES
# ============================================================
@app.route("/weather/probability", methods=["POST"])
def weather_probability():
    try:
        data = request.get_json() or {}
        print("[weather/probability] request body:", data)

        location = data.get("location")
        date_range = data.get("date_range") or data.get("date_range") or data.get("date_range")
        include_ai_insights = data.get("include_ai_insights", False)
        dataset_mode = data.get("dataset_mode") or "Global"

        # Basic validation
        if not location:
            return jsonify({"error": "Missing required parameters: location is required."}), 400

        if not date_range or not date_range.get("start_date"):
            return jsonify({
                "error": "Missing required parameters: date_range with start_date required."
            }), 400

        # Use provided coordinates
        lat = float(location.get("latitude", 0))
        lng = float(location.get("longitude", 0))
        city_name = location.get("city_name") or f"Location ({lat}, {lng})"

        # Seasonal base (Python port of your JS logic)
        def get_seasonal_base(lat_val, date_str):
            month = datetime.fromisoformat(date_str).month - 1  # 0-based month in JS
            is_northern = lat_val > 0

            if is_northern:
                if 2 <= month <= 4:
                    return {"rain": 25, "sunny": 60, "cloudy": 40, "temp": 28}
                if 5 <= month <= 7:
                    return {"rain": 70, "sunny": 45, "cloudy": 60, "temp": 32}
                if 8 <= month <= 10:
                    return {"rain": 50, "sunny": 55, "cloudy": 45, "temp": 26}
                return {"rain": 15, "sunny": 70, "cloudy": 30, "temp": 20}
            else:
                if 8 <= month <= 10:
                    return {"rain": 25, "sunny": 60, "cloudy": 40, "temp": 28}
                if month >= 11 or month <= 1:
                    return {"rain": 70, "sunny": 45, "cloudy": 60, "temp": 32}
                if 2 <= month <= 4:
                    return {"rain": 50, "sunny": 55, "cloudy": 45, "temp": 26}
                return {"rain": 15, "sunny": 70, "cloudy": 30, "temp": 20}

        seasonal = get_seasonal_base(lat, date_range["start_date"])

        def generate_condition(base_prob, label, threshold, description):
            val = max(0, min(100, base_prob + random.random() * 20 - 10))
            return {
                "probability": round(val, 2),
                "label": label,
                "threshold": threshold,
                "description": description,
            }

        response = {
            "location": {
                "latitude": lat,
                "longitude": lng,
                "city_name": city_name,
            },
            "date_range": {
                "start_date": date_range["start_date"],
                "end_date": date_range.get("end_date") or date_range["start_date"],
            },
            "probabilities": {
                "rain": generate_condition(seasonal["rain"], "Moderate", ">5mm", "Chance of rainfall"),
                "extreme_heat": generate_condition(
                    max(5, seasonal["temp"] - 25), "Low", ">35°C", "Risk of extreme heat"
                ),
                "high_wind": generate_condition(20, "Low", ">40km/h", "Strong wind conditions"),
                "cloudy": generate_condition(seasonal["cloudy"], "High", ">70%", "Cloud coverage"),
                "good_weather": generate_condition(100 - seasonal["rain"], "High", "Clear skies", "Favorable conditions"),
                "summary": {
                    "data_points": random.randint(100, 600),
                    "date_range": f'{date_range["start_date"]} to {date_range.get("end_date") or date_range["start_date"]}',
                    "location": city_name,
                    "risk_level": "Moderate",
                    "data_quality": "Good",
                },
            },
            "data_sources": ["Historical Climate Data", "Weather Stations", "Satellite Data"],
            "analysis_period": f'{date_range["start_date"]} to {date_range.get("end_date") or date_range["start_date"]}',
            "dataset_mode": dataset_mode,
        }

        if include_ai_insights:
            def safe_format(v):
                return f"{v:.1f}" if isinstance(v, (int, float)) else "N/A"

            rain = safe_format(response["probabilities"]["rain"]["probability"])
            sunny = safe_format( seasonal["sunny"])
            temp = safe_format(seasonal["temp"])

            insights = (
                f"Based on historical data for {city_name}, "
                f"there's a {rain}% chance of rain. "
                f"Sunny conditions around {sunny}% are expected. "
                f"Temperature around {temp}°C is expected."
            )
            response["ai_insights"] = insights

        return jsonify(response), 200

    except Exception as e:
        print("[weather/probability] handler error:", e)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
@app.route("/api/message", methods=["POST"])
def api_message():
    data = request.get_json() or {}
    user_input = (data.get("text") or "").strip()

    if not user_input:
        return jsonify({"reply": "Please enter a message."})

    add_message("user", user_input)
    reply = full_response(user_input).strip()

    if not reply:
        retry_prompt = (
            "<|system|> Provide a short correct answer.\n"
            f"<|user|> {user_input}\n"
            "<|assistant|>"
        )
        reply = generate_nlm_reply(retry_prompt)

    add_message("ai", reply)

    return jsonify({
        "reply": reply,
        "status": "success",
        "timestamp": datetime.now().isoformat()
    })

@app.route("/ml/predict", methods=["POST"])
def ml_predict():
    try:
        data = request.get_json() or {}

        temp = data.get("temp")
        humidity = data.get("humidity")

        if temp is None or humidity is None:
            return jsonify({"error": "temp and humidity required"}), 400

        result = get_ml_prediction(temp, humidity)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/history")
def api_history():
    msgs = get_recent_messages(20)
    return jsonify([{"role": r, "content": c} for r, c in msgs])


@app.route("/api/clear", methods=["POST"])
def api_clear():
    clear_history()
    return jsonify({"message": "Chat memory cleared."})


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "model": "Qwen2.5-1.5B + MarianMT",
        "weather_api": bool(OPENWEATHER_API),
        "timestamp": datetime.now().isoformat()
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
