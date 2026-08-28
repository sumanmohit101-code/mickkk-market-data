export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  const response = await context.env.ASSETS.fetch(request);
  if (!response.ok) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  const bridge = `<script>
(() => {
  const originalFetch = window.fetch.bind(window);
  const GITHUB_DATA_BASE = '/data';

  function bucket(symbol) {
    const first = String(symbol || '').trim().toUpperCase().charAt(0);
    return /^[A-Z]$/.test(first) ? first : '0-9';
  }

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': 'no-store'
      }
    });
  }

  async function githubSymbols() {
    const r = await originalFetch(GITHUB_DATA_BASE + '/symbols.json?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return jsonResponse({ error: 'GitHub symbols HTTP ' + r.status }, r.status);
    const payload = await r.json();
    const source = Array.isArray(payload) ? payload : (payload.symbols || payload.data || []);
    const seen = new Set();
    const symbols = source
      .map(x => ({
        symbol: String(x.symbol || '').trim().toUpperCase(),
        name: String(x.name || x.symbol || '').trim()
      }))
      .filter(x => x.symbol && !seen.has(x.symbol) && seen.add(x.symbol))
      .sort((a, b) => a.symbol.localeCompare(b.symbol, undefined, { numeric: true, sensitivity: 'base' }));
    return jsonResponse({ symbols });
  }

  async function githubOHLC(symbol) {
    const clean = String(symbol || '').trim().toUpperCase();
    if (!clean) return jsonResponse({ error: 'Missing symbol' }, 400);
    const r = await originalFetch(
      GITHUB_DATA_BASE + '/' + bucket(clean) + '/' + encodeURIComponent(clean) + '.json?v=' + Date.now(),
      { cache: 'no-store' }
    );
    if (!r.ok) return jsonResponse({ error: 'GitHub chart data HTTP ' + r.status + ' for ' + clean }, r.status);
    const payload = await r.json();
    const rows = Array.isArray(payload) ? payload : (payload.candles || payload.records || []);
    if (!Array.isArray(rows)) return jsonResponse({ error: 'Invalid GitHub candle payload for ' + clean }, 502);

    const candles = rows
      .filter(c => c && c.time && !isNaN(Number(c.close)) && Number(c.close) > 0)
      .map(c => ({
        time: String(c.time).slice(0, 10),
        open: Number(c.open ?? c.close),
        high: Number(c.high ?? c.close),
        low: Number(c.low ?? c.close),
        close: Number(c.close),
        volume: Number(c.volume || 0)
      }))
      .sort((a, b) => a.time < b.time ? -1 : 1);

    return jsonResponse({ candles });
  }

  window.fetch = async function(input, init) {
    try {
      const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
      const parsed = new URL(requestUrl, window.location.href);
      const action = parsed.searchParams.get('action');

      // Only redirect market-data actions to GitHub. Existing watchlists,
      // alerts and live-price calls continue through the original API.
      if (action === 'getSymbols') return githubSymbols();
      if (action === 'getOHLC') return githubOHLC(parsed.searchParams.get('symbol'));
    } catch (e) {
      console.warn('MICKKK GitHub data bridge error:', e);
    }

    return originalFetch(input, init);
  };
})();
</script>`;

  if (!html.includes('MICKKK GitHub data bridge')) {
    html = html.replace('</head>', bridge + '</head>');
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=UTF-8');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');

  return new Response(html, {
    status: response.status,
    headers
  });
}
