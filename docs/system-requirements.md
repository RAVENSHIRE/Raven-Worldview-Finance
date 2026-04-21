# Raven Worldview Finance Requirements

## Scope

Raven Worldview Finance is a spatial market-intelligence dashboard that combines:

- real-time equity quotes and historical series
- geospatial rendering of company and event nodes
- asynchronous alternative-data ingestion
- live AI swarm commentary

The production architecture uses:

- React/Vite for the dashboard UI
- Node.js/Express as the aggregation server
- WebSockets for low-latency event distribution
- server-side caching to shield downstream market APIs

## Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| FR-01 | Market Data Fetching | The system must retrieve quote snapshots and daily historical charts for a predefined asset universe. |
| FR-02 | Geo-Spatial Rendering | The UI must render both 3D globe and 2D flat-map views with company headquarters and geo-tagged alerts. |
| FR-03 | Alternative Data Ingestion | The backend must accept asynchronous alternative-data alerts from authorized ingestion clients over WebSocket. |
| FR-04 | AI Agent Swarm Stream | The backend must broadcast AI swarm messages to all connected UI clients in real time. |
| FR-05 | Layer Toggling | Users must be able to toggle spatial layers such as AIS corridors, aerospace, crypto, and heatmap overlays. |
| FR-06 | Server-Owned Universe | The backend must expose the base asset universe and metadata through `/api/universe` so frontend deployments are not required for symbol-list changes. |

## Non-Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| NFR-01 | Scalability | The backend must cache upstream market responses so at least 1,000 concurrent clients can be served without multiplying downstream API calls. |
| NFR-02 | Latency | Valid ingestion events should reach connected UI clients in under 200 ms on the local server path. |
| NFR-03 | Resilience | The UI must automatically reconnect after WebSocket disconnects using exponential backoff. |
| NFR-04 | Data Integrity | The aggregation server must reject malformed ingestion payloads instead of forwarding them to clients. |
| NFR-05 | Operability | Health and cache status must be visible through a health endpoint for monitoring and debugging. |

## Use Cases

### UC-01 Monitor Global Equities

- Primary actor: Analyst / Trader
- Goal: Observe geographically distributed market activity and identify pre-mover opportunities.
- Preconditions: User is authenticated to the dashboard and the market cache is populated.
- Main flow:
  1. User opens the dashboard.
  2. Client loads the asset universe from `/api/universe`.
  3. Client requests batch quotes from `/api/market/batch`.
  4. User switches between globe and flat-map modes.
  5. User selects a ticker for detailed monitoring and history.
- Success outcome: User sees refreshed prices, geospatial positioning, and historical context.

### UC-02 Evaluate Alternative Data

- Primary actor: Analyst / Trader
- Supporting actor: Ingestion Engine
- Goal: Understand macro or operational disruptions from geo-tagged alerts.
- Preconditions: Authorized ingestion engine is connected to the WebSocket endpoint.
- Main flow:
  1. Ingestion engine sends an alert payload.
  2. Aggregation server validates the payload.
  3. Server broadcasts the alert to all dashboard clients.
  4. UI stores the event and re-renders feed and map overlays.
- Success outcome: The analyst sees the new alert in the live feed and on the map.

### UC-03 Review AI Swarm Commentary

- Primary actor: Analyst / Trader
- Goal: Read AI persona commentary alongside price and geo events.
- Preconditions: Dashboard WebSocket connection is active.
- Main flow:
  1. Server generates or receives swarm messages.
  2. Server broadcasts the swarm payload.
  3. Client appends the message to the swarm sidebar.
- Success outcome: Analyst sees the latest agent narrative without refreshing the page.

### UC-04 Push Signal From Ingestion Engine

- Primary actor: Ingestion Engine
- Goal: Publish a validated finance event into the dashboard network.
- Preconditions: Engine has the correct ingestion token.
- Main flow:
  1. Engine opens WebSocket with `role=ingest`.
  2. Engine sends JSON matching the finance-event or swarm schema.
  3. Server validates the payload.
  4. Server broadcasts the payload to UI clients.
- Alternate flow:
  - If the token is invalid, the server closes the connection.
  - If the payload is invalid, the server rejects it and does not broadcast it.

## BPMN-Style Process Definition

### Pool

- Raven Worldview System

### Lanes

- Lane 1: Ingestion Engine (Python)
- Lane 2: Aggregation Server (Node.js)
- Lane 3: Client Dashboard (React)

### Flow

1. Start Event: Timer or external trigger fires in ingestion engine.
2. Task: Fetch alternative data from upstream providers.
3. Task: Normalize payload into Raven event schema with timestamp and optional coordinates.
4. Message Flow: Publish payload to Node.js WebSocket ingestion channel.
5. Exclusive Gateway: Is payload valid and authorized?
6. Rejection path: Send rejection status and stop.
7. Acceptance path: Broadcast payload to connected UI clients.
8. Task: Client store appends event or swarm message.
9. Task: Dashboard re-renders globe, flat map, and live feed.
10. End Event: User visualizes the new information.

## Traceability To Current Implementation

- `server.ts`
  - provides `/api/universe`
  - caches quote and history responses
  - validates and broadcasts ingestion payloads
  - fan-outs AI swarm events to all UI clients
- `src/App.tsx`
  - loads universe from the server
  - polls cached batch quotes
  - reconnects WebSocket sessions with exponential backoff
- `scripts/ingestion_demo.py`
  - authenticates as an ingestion client and publishes structured events
