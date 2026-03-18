const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const cheerio = require('cheerio');

const app  = express();
const PORT = process.env.PORT || 3000;

// Allow requests from any origin (your dashboard HTML file)
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Manohar Capital — Chartink Proxy is running ✓' });
});

// ── Main scan endpoint ──
// POST /scan  body: { scan_clause: "..." }
app.post('/scan', async (req, res) => {
  const scan_clause = req.body?.scan_clause;
  if (!scan_clause) {
    return res.status(400).json({ error: 'scan_clause is required' });
  }

  try {
    // Step 1: load Chartink screener page to get CSRF token + cookies
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

    // Extract CSRF token
    const $ = cheerio.load(pageRes.data);
    let csrf = $('meta[name="csrf-token"]').attr('content');

    if (!csrf) {
      // Try other patterns
      const match = pageRes.data.match(/csrf[_-]token['"]\s*[,:]\s*['"]([\w+/=]+)['"]/i)
                 || pageRes.data.match(/content="([\w+/=]{20,})"\s+name="csrf-token"/i);
      csrf = match?.[1];
    }

    if (!csrf) {
      return res.status(500).json({ error: 'Could not extract CSRF token from Chartink' });
    }

    // Step 2: POST the scan
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

    const data = scanRes.data;

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
      hint: 'Chartink may be temporarily blocking requests. Try again in a minute.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Chartink proxy running on port ${PORT}`);
});
