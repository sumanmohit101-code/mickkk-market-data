export async function onRequest(context) {
  const request = context.request;

  // Only wrap the production root page. Other assets continue through Pages.
  const url = new URL(request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return context.env.ASSETS.fetch(request);
  }

  const response = await context.env.ASSETS.fetch(request);
  if (!response.ok) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  const tag = '<script src="/charts/root-enhancements.js?v=20260828" defer></script>';

  if (!html.includes('/charts/root-enhancements.js')) {
    html = html.replace('</body>', `${tag}</body>`);
    if (html === response) return response;
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=UTF-8');
  headers.set('cache-control', 'no-cache, no-store, must-revalidate');

  return new Response(html, {
    status: response.status,
    headers
  });
}
