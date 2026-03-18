const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const cheerio = require('cheerio');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Manohar Capital — Chartink Proxy is running ✓' });
});

// ── Shared helper: get CSRF + cookies + run one Chartink scan ──
async function runScan(scan_clause) {
  const session = axios.create({
    baseURL: 'https://chartink.com',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    },
    withCredentials: true,
    timeout: 20000,
  });

  const pageRes = await session.get('/screener/');
  const cookies = pageRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

  const $ = cheerio.load(pageRes.data);
  let csrf = $('meta[name="csrf-token"]').attr('content');
  if (!csrf) {
    const match = pageRes.data.match(/csrf[_-]token['"]\s*[,:]\s*['"]([\w+/=]+)['"]/i)
               || pageRes.data.match(/content="([\w+/=]{20,})"\s+name="csrf-token"/i);
    csrf = match?.[1];
  }
  if (!csrf) throw new Error('Could not extract CSRF token from Chartink');

  const scanRes = await session.post(
    '/screener/process',
    new URLSearchParams({ scan_clause }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://chartink.com/screener/',
        'Origin': 'https://chartink.com',
        'Cookie': cookies,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      timeout: 20000,
    }
  );
  return scanRes.data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Scan clauses for breadth ──
const BREADTH = {
  total:     '( {cash} ( daily close > 0 ) )',
  above10MA: '( {cash} ( daily close > daily ema( daily close,10 ) ) )',
  above20MA: '( {cash} ( daily close > daily ema( daily close,20 ) ) )',
  above50MA: '( {cash} ( daily close > daily ema( daily close,50 ) ) )',
  above200MA:'( {cash} ( daily close > daily ema( daily close,200 ) ) )',
  adv4pct:   '( {cash} ( daily close >= 1.04 * 1 day ago daily close ) )',
  dec4pct:   '( {cash} ( daily close <= 0.96 * 1 day ago daily close ) )',
};

// GET /breadth — returns all 7 live market breadth metrics
app.get('/breadth', async (req, res) => {
  try {
    const counts = {};

    for (const [key, clause] of Object.entries(BREADTH)) {
      try {
        const data = await runScan(clause);
        counts[key] = data?.recordsTotal || data?.data?.length || 0;
        await sleep(700); // avoid rate limiting
      } catch(e) {
        console.error(`Breadth scan failed for ${key}:`, e.message);
        counts[key] = 0;
      }
    }

    const total = counts.total || 1800;

    return res.json({
      total,
      above10MA:  counts.above10MA,
      above20MA:  counts.above20MA,
      above50MA:  counts.above50MA,
      above200MA: counts.above200MA,
      adv4pct:    counts.adv4pct,
      dec4pct:    counts.dec4pct,
      pct10MA:    +((counts.above10MA  / total * 100).toFixed(2)),
      pct20MA:    +((counts.above20MA  / total * 100).toFixed(2)),
      pct50MA:    +((counts.above50MA  / total * 100).toFixed(2)),
      pct200MA:   +((counts.above200MA / total * 100).toFixed(2)),
      netBreadth: +((counts.adv4pct - counts.dec4pct).toFixed(2)),
      timestamp:  new Date().toISOString(),
    });
  } catch(err) {
    console.error('Breadth error:', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// POST /scan — runs a custom scan clause, returns full stock list
app.post('/scan', async (req, res) => {
  const scan_clause = req.body?.scan_clause;
  if (!scan_clause) {
    return res.status(400).json({ error: 'scan_clause is required' });
  }

  try {
    const data = await runScan(scan_clause);

    if (!data || !data.data) {
      return res.status(502).json({ error: 'Chartink returned empty data', raw: data });
    }

    return res.json({
      total: data.recordsTotal || data.data.length,
      data:  data.data,
    });
  } catch (err) {
    console.error('Scan error:', err.message);
    return res.status(502).json({
      error: err.message,
      hint: 'Chartink may be temporarily blocking. Try again in a minute.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Chartink proxy running on port ${PORT}`);
});
