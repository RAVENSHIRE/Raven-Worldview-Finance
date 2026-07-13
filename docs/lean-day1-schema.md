# Lean Day 1 Framework — Database & Automation Layer

Foundation-hardening reference for the compressed 28-column tracker, the
FINMA-safe nomenclature, and the no-code Discord workflow. The in-app
counterparts live in `src/lib/leanSchema.ts` and
`src/services/riskMonitoringEngine.ts`.

## 1. FINMA nomenclature lockdown (FinSA Art. 3)

The application, global state, and any public response bot never compile
direct market directives. Vocabulary is locked to systematic research
parameters:

| Killed (directive) | Replacement (systematic research) |
|---|---|
| `AI_Conviction: Buy / Sell` | `Algorithmic_State: Expansion / Contraction / Neutral` |
| `Entry_Zone` | `Primary_Liquidity_Support` |
| `Price_Target` | `Measured_Move_Resistance` |
| `Stop_Loss` | `Invalidation_Level_Num` |

If an asset violates a technical state, the interface renders algorithmic
classifications — never explicit buying or selling advice, and no
conversational paragraphs inside validation loops.

## 2. Google Sheets header (paste row 1)

```
Ticker	Asset_Name	Sector_Tag	Horizon	Core_Thesis	Catalyst	Invalidation_Level_Num	Risk_Band	Max_Pos_Size_Pct	Macro_Regime_Flag	BTC_Floor_Check	Volatility_Flag	Correlation_Risk	AI_Systematic_Score	Algorithmic_State	Key_Support	Key_Resistance	Base_Scenario	Status	Audit_Timestamp
```

Manual entry is quarantined to the qualitative parameters (Core_Thesis,
Catalyst, Invalidation_Level_Num, Risk_Band, …). Everything quantitative is
formula-driven.

## 3. Consolidated Day 1 sector tree

- **TECH** — AI, SaaS, Hardware, Cyber
- **CRYP** — L1, L2, DeFi, Infra
- **ENRG** — Nuclear, Renewables, Grid
- **DFNS** — Space, AeroDef, CyberDef

## 4. Quantitative automation formulas (row 2, ticker in `A2`)

```
Price:    =GOOGLEFINANCE(A2, "price")
Volume:   =GOOGLEFINANCE(A2, "volume")
50-DMA:   =AVERAGE(INDEX(GOOGLEFINANCE(A2, "price", TODAY()-70, TODAY()), 0, 2))
200-DMA:  =AVERAGE(INDEX(GOOGLEFINANCE(A2, "price", TODAY()-280, TODAY()), 0, 2))
```

## 5. Binary risk invalidation

`Status` is a hard mathematical state, mirrored by
`evaluateRiskState()` in `src/services/riskMonitoringEngine.ts`:

```
Status = IF(Price < Invalidation_Level_Num, "INVALIDATED", "ACTIVE")
```

An `INVALIDATED` flip updates the row instantly and drives high-contrast
alert styling — no manual intervention, no emotion, no paragraphs.

## 6. No-code Discord bot workflow (Make.com / Zapier)

```
[User Discord Query: /check FIG]
        │
        ▼
[Make.com Webhook Router]
        │
        ▼
[Google Sheets row lookup on "FIG"]  ──► pulls automated Price + Core_Thesis
        │
        ▼
[Discord Rich Embed Message Sent]    ──► displays Algorithmic_State & support lines
```

The embed renders `Algorithmic_State`, `Key_Support` / `Key_Resistance`, and
`Core_Thesis` only — never directive language.
