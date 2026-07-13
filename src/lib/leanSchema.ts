// Lean Day 1 database schema — 28-column compressed tracker (down from the
// 76-column manual matrix). Manual entry is quarantined to qualitative
// parameters; quantitative metrics are offloaded to autonomous formulas.
// Nomenclature is locked to systematic research parameters (FinSA Art. 3):
// no Buy/Sell/Entry/Target vocabulary anywhere in the schema.

export const LEAN_SHEET_HEADERS = [
  'Ticker',
  'Asset_Name',
  'Sector_Tag',
  'Horizon',
  'Core_Thesis',
  'Catalyst',
  'Invalidation_Level_Num',
  'Risk_Band',
  'Max_Pos_Size_Pct',
  'Macro_Regime_Flag',
  'BTC_Floor_Check',
  'Volatility_Flag',
  'Correlation_Risk',
  'AI_Systematic_Score',
  'Algorithmic_State',
  'Key_Support',
  'Key_Resistance',
  'Base_Scenario',
  'Status',
  'Audit_Timestamp',
] as const;

// Consolidated Day 1 sector tree — 4 core-thesis sectors (expand in Q3).
export const CORE_SECTOR_TREE = {
  TECH: ['AI', 'SaaS', 'Hardware', 'Cyber'],
  CRYP: ['L1', 'L2', 'DeFi', 'Infra'],
  ENRG: ['Nuclear', 'Renewables', 'Grid'],
  DFNS: ['Space', 'AeroDef', 'CyberDef'],
} as const;

export type SectorTag = keyof typeof CORE_SECTOR_TREE;

// Quantitative automation layer: programmatic Google Finance formulas injected
// across the dynamic columns at sheet initialization (row 2 shown; ticker in A2).
export const GOOGLEFINANCE_FORMULAS = {
  price: '=GOOGLEFINANCE(A2, "price")',
  volume24h: '=GOOGLEFINANCE(A2, "volume")',
  dma50: '=AVERAGE(INDEX(GOOGLEFINANCE(A2, "price", TODAY()-70, TODAY()), 0, 2))',
  dma200: '=AVERAGE(INDEX(GOOGLEFINANCE(A2, "price", TODAY()-280, TODAY()), 0, 2))',
} as const;
