interface StreamSSEOptions {
  url: string;
  body: BodyInit;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
}

/**
 * POSTs to an SSE endpoint and invokes `onEvent` for every parsed `data: ` event.
 * Throws on HTTP errors (message from the response `error` field when available),
 * missing response body, and abort (AbortError propagates from fetch).
 */
export async function streamSSE({ url, body, headers, signal, onEvent }: StreamSSEOptions): Promise<void> {
  const response = await fetch(url, { method: 'POST', headers, body, signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    try {
      onEvent(JSON.parse(line.slice(6)));
    } catch {
      // Ignore parse errors for incomplete data
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events, keeping any incomplete line in the buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      processLine(line);
    }
  }

  // Flush remaining decoder output and any trailing buffered event
  buffer += decoder.decode();
  for (const line of buffer.split('\n')) {
    processLine(line);
  }
}
