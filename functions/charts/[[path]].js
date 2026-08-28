export async function onRequest(context) {
  const url = new URL(context.request.url);
  const asset = await context.env.ASSETS.fetch(url);

  if (!asset.ok) return asset;

  const contentType = asset.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return asset;

  const html = await asset.text();
  const scriptTag = '<script src="/charts/enhancements.js?v=1" defer></script>';
  const bodyTag = /<\/body>/i;
  const patched = bodyTag.test(html) ? html.replace(bodyTag, `${scriptTag}\n</body>`) : `${html}\n${scriptTag}`;

  const headers = new Headers(asset.headers);
  headers.set('content-type', 'text/html; charset=UTF-8');
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(patched, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}
