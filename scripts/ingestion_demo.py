import asyncio
import json
import random
import datetime
import os
import websockets

# Mock Financial & Alternative Geo Data Sources
# In a production environment, you would use:
# - AIS: Spire, Orbcomm, or MarineTraffic API
# - Aerospace: Space-Track.org or Rocket Lab API
# - Crypto: Chainlink or node health status APIs
# - Equities: Polygon.io or Alpaca

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
    Simulates a Python microservice that fetches real-time data from 
    disparate finance/geo APIs and pushes them to the central backend.
    """
    token = os.getenv("INGESTION_TOKEN", "raven-dev-ingest")
    uri = f"ws://localhost:3000?role=ingest&token={token}"

    async with websockets.connect(uri) as websocket:
        print(f"[INGESTION_ENGINE] Connection Established to Finance-Worldview Pulse")
        
        while True:
            # Simulate processing time for various scrapers/APIs
            await asyncio.sleep(random.uniform(5, 12))
            
            # Select random event and attach timestamp
            event = {
                **random.choice(FINANCE_NODES),
                "timestamp": datetime.datetime.now().isoformat()
            }
            
            # Push to the dashboard stream
            print(f"[PUSH] -> {event['label']}")
            await websocket.send(json.dumps(event))

if __name__ == "__main__":
    try:
        asyncio.run(stream_finance_worldview())
    except KeyboardInterrupt:
        print("[INGESTION_ENGINE] Offline")
    except ConnectionRefusedError:
        print("[ERROR] Could not connect to dashboard server. Ensure 'npm run dev' is active.")
