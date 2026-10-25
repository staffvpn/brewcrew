// GET /card/:id — отдаёт сохранённую картинку-карточку.
export async function onRequestGet({ params, env }) {
  if (!env.CARDS) return new Response('not configured', { status: 503 });
  const { value, metadata } = await env.CARDS.getWithMetadata(String(params.id), { type: 'arrayBuffer' });
  if (!value) return new Response('not found', { status: 404 });
  return new Response(value, { headers: { 'content-type': (metadata && metadata.type) || 'image/png', 'cache-control': 'public, max-age=86400' } });
}
