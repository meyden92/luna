import { createFileRoute } from '@tanstack/react-router';
import { buildOEmbedResponse, parsePositiveInteger, parsePublicViewUrl } from '@/libs/oembed';
import { findPublicEmbedFile } from '@/libs/oembed-data';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    },
  });
}

async function handle(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const format = requestUrl.searchParams.get('format');
  if (format && format !== 'json') return json({ error: 'Only JSON oEmbed is supported' }, 501);

  const sourceUrl = requestUrl.searchParams.get('url');
  if (!sourceUrl) return json({ error: 'url is required' }, 400);

  const id = parsePublicViewUrl(sourceUrl);
  if (!id) return json({ error: 'A public /view/{id} URL is required' }, 400);

  const file = await findPublicEmbedFile(id);
  if (!file) return json({ error: 'File not found' }, 404);

  return json(
    buildOEmbedResponse(file, {
      maxWidth: parsePositiveInteger(requestUrl.searchParams.get('maxwidth')),
      maxHeight: parsePositiveInteger(requestUrl.searchParams.get('maxheight')),
    }),
  );
}

export const Route = createFileRoute('/api/oembed')({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
