// Media Transcription Engine — asynchronous alpha-creator tracking layer.
//
// Users register profile handles for preferred creators (YouTube, TradingView,
// Twitter/X). The engine polls public feeds for new uploads, queues them for
// transcription + multi-modal slide extraction, and distills a core investment
// thesis per upload. A collaborative audit loop lets users write
// micro-adjustments that are recursively piped back into the extraction
// prompt context to tune future runs.
//
// Heavy adapters (Whisper audio transcription, visual-transition slide
// snapshotting) are pluggable: without configured adapters the records are
// created in `pending` states so the UI and audit loop stay fully functional.
// Persistence mirrors the app's hybrid pattern: Redis when reachable,
// in-memory otherwise.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export type CreatorPlatform = 'youtube' | 'tradingview' | 'twitter';

export interface Creator {
  id: string;
  platform: CreatorPlatform;
  handle: string;           // @handle, channel id (UC…), or username
  addedAt: string;
  lastPolledAt?: string;
}

export interface SlideCapture {
  timestamp: string;        // position in source video, e.g. "12:41"
  imageUrl: string;
  caption?: string;
}

export interface ExtractionRecord {
  id: string;
  creatorId: string;
  platform: CreatorPlatform;
  handle: string;
  title: string;
  url: string;
  publishedAt: string;
  transcriptStatus: 'pending_transcription' | 'transcribed' | 'adapter_not_configured' | 'failed';
  transcript?: string;
  slides: SlideCapture[];
  slideStatus: 'pending_extraction' | 'extracted' | 'adapter_not_configured';
  // Core investment thesis distilled from available signal (title/description/
  // transcript). Compliance matrix enforced: systematic research vocabulary only.
  thesis: string | null;
  audits: { note: string; at: string }[];
  createdAt: string;
}

// Pluggable heavy-lift adapters. Wire real implementations (Whisper worker,
// ffmpeg scene-detection snapshotter) by passing them into the factory.
export interface MediaAdapters {
  transcribeAudio?: (url: string) => Promise<string>;
  extractSlides?: (url: string) => Promise<SlideCapture[]>;
}

export interface MediaEngineDeps {
  redis: any;
  broadcast: (payload: object) => void;
  adapters?: MediaAdapters;
  pollIntervalMs?: number;
}

const CREATORS_KEY = 'research:creators';
const EXTRACTIONS_KEY = 'research:extractions';
const MAX_EXTRACTIONS = 300;

const COMPLIANCE_RULES = `COMPLIANCE (Swiss FinSA Art. 3): output systematic research vocabulary only.
Never use Buy/Sell/Entry/Exit/Price Target. Classify via Algorithmic_State
(Expansion/Contraction/Neutral), Primary_Liquidity_Support, Measured_Move_Resistance,
Invalidation_Level.`;

export function createMediaTranscriptionEngine(deps: MediaEngineDeps) {
  const { redis, broadcast } = deps;
  const adapters = deps.adapters ?? {};
  const pollInterval = deps.pollIntervalMs ?? 30 * 60_000;

  let creators: Creator[] = [];
  let extractions: ExtractionRecord[] = []; // newest first
  const seenUploadUrls = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;

  // ── Persistence (Redis + memory mirror) ──
  async function persist(): Promise<void> {
    try {
      await redis.set(CREATORS_KEY, JSON.stringify(creators));
      await redis.set(EXTRACTIONS_KEY, JSON.stringify(extractions.slice(0, MAX_EXTRACTIONS)));
    } catch { /* memory mirror remains authoritative */ }
  }

  async function hydrate(): Promise<void> {
    try {
      const [c, e] = await Promise.all([redis.get(CREATORS_KEY), redis.get(EXTRACTIONS_KEY)]);
      if (c) creators = JSON.parse(c);
      if (e) {
        extractions = JSON.parse(e);
        for (const rec of extractions) seenUploadUrls.add(rec.url);
      }
    } catch { /* cold start on memory */ }
  }

  // ── Backcheck loop: recent audit notes feed the next extraction prompt ──
  function buildAuditContext(): string {
    const notes = extractions
      .flatMap(e => e.audits.map(a => a.note))
      .slice(0, 12);
    if (notes.length === 0) return '';
    return `\nANALYST BACKCHECK ADJUSTMENTS (apply these corrections from prior audits):\n- ${notes.join('\n- ')}`;
  }

  async function distillThesis(rec: Pick<ExtractionRecord, 'title' | 'handle' | 'platform' | 'transcript'>): Promise<string | null> {
    if (!GEMINI_API_KEY) return null;
    const signal = rec.transcript
      ? `Transcript excerpt:\n${rec.transcript.slice(0, 6000)}`
      : `Only the upload title is available: "${rec.title}"`;
    const prompt = `You extract core investment theses from financial media.
Source: ${rec.platform} creator ${rec.handle}.
${signal}

Return 1-2 dense sentences stating the core thesis and any referenced levels,
using Algorithmic_State / Primary_Liquidity_Support / Measured_Move_Resistance /
Invalidation_Level vocabulary. If no thesis is detectable, return "NO_THESIS_SIGNAL".
${COMPLIANCE_RULES}${buildAuditContext()}`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );
      if (!res.ok) return null;
      const raw: any = await res.json();
      const text: string = raw?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      return text || null;
    } catch {
      return null;
    }
  }

  async function processUpload(creator: Creator, upload: { title: string; url: string; publishedAt: string }): Promise<void> {
    if (seenUploadUrls.has(upload.url)) return;
    seenUploadUrls.add(upload.url);

    const rec: ExtractionRecord = {
      id: crypto.randomUUID(),
      creatorId: creator.id,
      platform: creator.platform,
      handle: creator.handle,
      title: upload.title,
      url: upload.url,
      publishedAt: upload.publishedAt,
      transcriptStatus: adapters.transcribeAudio ? 'pending_transcription' : 'adapter_not_configured',
      slides: [],
      slideStatus: adapters.extractSlides ? 'pending_extraction' : 'adapter_not_configured',
      thesis: null,
      audits: [],
      createdAt: new Date().toISOString(),
    };

    if (adapters.transcribeAudio) {
      try {
        rec.transcript = await adapters.transcribeAudio(upload.url);
        rec.transcriptStatus = 'transcribed';
      } catch {
        rec.transcriptStatus = 'failed';
      }
    }
    if (adapters.extractSlides) {
      try {
        rec.slides = await adapters.extractSlides(upload.url);
        rec.slideStatus = 'extracted';
      } catch { /* keep pending */ }
    }

    rec.thesis = await distillThesis(rec);

    extractions.unshift(rec);
    if (extractions.length > MAX_EXTRACTIONS) extractions.length = MAX_EXTRACTIONS;
    await persist();
    broadcast({ type: 'RESEARCH_EXTRACTION', payload: rec });
  }

  // YouTube channel-ID feeds need no API key. Handles that aren't channel IDs
  // (and TradingView/Twitter profiles) have no stable public feed — those
  // creators stay registered and are picked up once a scraper adapter is wired.
  async function pollYouTube(creator: Creator): Promise<void> {
    const id = creator.handle.trim();
    if (!/^UC[\w-]{20,}$/.test(id)) return;
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return;
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1, 4); // 3 most recent uploads
    for (const entry of entries) {
      const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'UNTITLED_UPLOAD';
      const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? new Date().toISOString();
      if (!videoId) continue;
      await processUpload(creator, {
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: published,
      });
    }
  }

  async function pollAll(): Promise<void> {
    for (const creator of creators) {
      try {
        if (creator.platform === 'youtube') await pollYouTube(creator);
        creator.lastPolledAt = new Date().toISOString();
      } catch (err: any) {
        console.warn(`[MEDIA] Poll failed for ${creator.platform}/${creator.handle}:`, err?.message ?? err);
      }
    }
    await persist();
  }

  return {
    async start() {
      await hydrate();
      timer = setInterval(() => { pollAll().catch(() => {}); }, pollInterval);
      setTimeout(() => { pollAll().catch(() => {}); }, 8_000); // warm-up pass
      console.log(`[MEDIA] Transcription engine online (${creators.length} creators, poll ${pollInterval / 60000}m)`);
    },
    stop() { if (timer) clearInterval(timer); },

    listCreators: () => creators,
    async addCreator(platform: CreatorPlatform, handle: string): Promise<Creator> {
      const clean = handle.trim();
      const existing = creators.find(c => c.platform === platform && c.handle.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const creator: Creator = { id: crypto.randomUUID(), platform, handle: clean, addedAt: new Date().toISOString() };
      creators.push(creator);
      await persist();
      return creator;
    },
    async removeCreator(id: string): Promise<boolean> {
      const before = creators.length;
      creators = creators.filter(c => c.id !== id);
      await persist();
      return creators.length < before;
    },

    listExtractions: (limit = 50) => extractions.slice(0, limit),
    async addAudit(extractionId: string, note: string): Promise<ExtractionRecord | null> {
      const rec = extractions.find(e => e.id === extractionId);
      if (!rec) return null;
      rec.audits.unshift({ note: note.trim(), at: new Date().toISOString() });
      await persist();
      return rec;
    },
    pollAll, // manual trigger
  };
}
