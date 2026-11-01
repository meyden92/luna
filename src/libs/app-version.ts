// Server-only: knows which release this instance runs and which is the latest on GitHub.

const LATEST_RELEASE_URL = 'https://api.github.com/repos/meyden92/luna/releases/latest';
// Unauthenticated GitHub API calls allow 60 an hour per IP, so a found release is reused this long.
const CACHE_MS = 6 * 60 * 60 * 1000;

export interface Release {
  version: string;
  url: string;
}

let cached: { release: Release; fetchedAt: number } | undefined;

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Whether `latest` is a higher major.minor.patch than `current`. False when either is not such a version. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

/** The latest published GitHub release, cached for CACHE_MS. Throws when GitHub can't be reached or answers with an error. */
export async function fetchLatestRelease(): Promise<Release> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.release;

  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LunaShare' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const body = (await response.json()) as { tag_name: string; html_url: string };

  const release = { version: body.tag_name, url: body.html_url };
  cached = { release, fetchedAt: Date.now() };
  return release;
}
