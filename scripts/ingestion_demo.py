import asyncio
import json
import random
import datetime
import redis
import os

# Mock Financial & Alternative Geo Data Sources
FINANCE_NODES = [
    {"type": "AIS_ALERT", "label": "Blockade Risk: Hormuz corridor slowing", "lat": 26.5, "lon": 56.5, "severity": "danger", "source": "GEO_INT"},
    {"type": "AERO_ALERT", "label": "Rocket Lab Launch Success - Mahia, NZ", "lat": -39.26, "lon": 177.86, "severity": "success", "source": "BLOOMBERG"},
    {"type": "CRYPTO_NODE", "label": "Base Chain Bridge Node High Latency", "lat": 37.77, "lon": -122.41, "severity": "warn", "source": "GEO_INT"},
    {"type": "MARKET_CATALYST", "label": "Nvidia (NVDA) H200 Cluster rollout detected in Texas", "symbol": "NVDA", "severity": "info", "source": "BLOOMBERG"},
    {"type": "MACRO_PULSE", "label": "IMF Report: Geo-economic fragmentation index rising", "severity": "warn", "source": "IMF"},
    {"type": "GEOPOLITICAL", "label": "Diplomatic Shift: US-Swiss strategic trade forum scheduled", "severity": "info", "source": "GEO_INT"}
]

async def stream_finance_worldview():
    """
    Simulates a Python microservice that fetches real-time data and
    publishes it to Redis channels for the Node.js gateway to broadcast.
    """
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    try:
        r = redis.from_url(redis_url)
        print(f"[INGESTION_ENGINE] Connected to Redis at {redis_url}")
    except Exception as e:
        print(f"[ERROR] Could not connect to Redis: {e}")
        return

    while True:
        # Simulate processing time for various scrapers/APIs
        await asyncio.sleep(random.uniform(5, 12))
        
        # Select random event and attach timestamp
        event = random.choice(FINANCE_NODES)
        event["timestamp"] = datetime.datetime.now().isoformat()
        
        # Determine channel based on event type
        channel = "raven:geo"
        if event["type"] == "MARKET_CATALYST":
            channel = "raven:equity"
        
        # Push to Redis
        print(f"[PUBLISH] -> {channel}: {event['label']}")
        try:
            r.publish(channel, json.dumps(event))
        except Exception as e:
            print(f"[ERROR] Publish failed: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(stream_finance_worldview())
    except KeyboardInterrupt:
        print("[INGESTION_ENGINE] Offline")
