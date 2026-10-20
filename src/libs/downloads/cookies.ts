const NETSCAPE_HEADER = /^# (Netscape )?HTTP Cookie File/;
// Netscape cookie files mark HttpOnly cookies by prefixing the domain field with
// this, which makes those lines look like comments.
const HTTP_ONLY_PREFIX = '#HttpOnly_';
const COOKIE_FIELDS = 7;

/**
 * Why `cookies` can't be a Source session for a Source whose cookies are set on
 * `domain`, or null when it can. A Source session is a Netscape `cookies.txt`
 * (what yt-dlp's `--cookies` reads): it either starts with the Netscape header or
 * consists of lines of 7 tab-separated fields, and at least one of its cookies
 * belongs to `domain` or one of its subdomains.
 */
export function cookiesProblem(cookies: string, domain: string): string | null {
  const lines = cookies.split(/\r?\n/).map((line) => line.trim());
  const hasHeader = NETSCAPE_HEADER.test(lines[0] ?? '');

  const cookieLines = lines
    .map((line, i) => ({ number: i + 1, line: line.startsWith(HTTP_ONLY_PREFIX) ? line.slice(HTTP_ONLY_PREFIX.length) : line }))
    .filter(({ line }) => line !== '' && !line.startsWith('#'));
  if (cookieLines.length === 0) return 'The file has no cookies. Export cookies.txt again while signed in.';

  const cookieFields = cookieLines.map(({ number, line }) => ({ number, fields: line.split('\t') }));
  if (!hasHeader) {
    const malformed = cookieFields.find(({ fields }) => fields.length !== COOKIE_FIELDS);
    if (malformed) {
      return `Not a Netscape cookies.txt file: line ${malformed.number} has ${malformed.fields.length} tab-separated fields, not ${COOKIE_FIELDS}.`;
    }
  }

  const matches = cookieFields.some(({ fields }) => {
    if (fields.length !== COOKIE_FIELDS) return false;
    const host = (fields[0] ?? '').toLowerCase().replace(/^\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  });
  return matches ? null : `The file has no cookies for ${domain}. Export cookies.txt while signed in to ${domain}.`;
}
