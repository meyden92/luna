const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|apikey|api_key|authorization|auth|cookie|session|otp|code|key|privateKey|content|value|fields|email/i;

const REDACTED = '[redacted]';

const MAX_LOGGED_INPUT_CHARS = 500;

function redactInput(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 5) return REDACTED;
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (value instanceof FormData) return REDACTED;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactInput(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactInput(v, depth + 1);
    }
  }
  return out;
}

export function logRequest({
  success,
  method,
  pathname,
  durationMs,
  userId,
  userEmail,
  input,
}: {
  success: boolean;
  method: string;
  pathname: string;
  durationMs: number;
  userId?: string;
  userEmail?: string;
  input?: unknown;
}) {
  const icon = success ? '\u2705' : '\u274C';
  const user = userId ? `${userId} (${userEmail || 'no-email'})` : 'anonymous';

  let inputStr = '';
  if (input !== undefined) {
    try {
      let serialized = JSON.stringify(redactInput(input));
      if (serialized && serialized.length > MAX_LOGGED_INPUT_CHARS) {
        serialized = `${serialized.slice(0, MAX_LOGGED_INPUT_CHARS)}…`;
      }
      inputStr = ` | Input: ${serialized}`;
    } catch {
      inputStr = ` | Input: ${REDACTED}`;
    }
  }

  console.log(`${icon} [${method} ${pathname}] ${durationMs}ms | User: ${user}${inputStr}`);
}
