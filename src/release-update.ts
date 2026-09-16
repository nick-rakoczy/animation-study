const latestReleaseUrl = "https://api.github.com/repos/nick-rakoczy/animation-study/releases/latest";
const releasePagePrefix = "/nick-rakoczy/animation-study/releases/";

interface GitHubRelease {
  readonly tag_name: string;
  readonly html_url: string;
}

interface ReleaseResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ReleaseRequest = (url: string, init: RequestInit) => Promise<ReleaseResponse>;

export interface AvailableUpdate {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly releaseUrl: string;
}

export async function findAvailableUpdate(
  currentVersion: string,
  request: ReleaseRequest = fetch,
): Promise<AvailableUpdate | null> {
  const response = await request(latestReleaseUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Animation-Study",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub release check failed with status ${response.status}`);

  const release = parseGitHubRelease(await response.json());
  const comparison = compareVersions(release.tag_name, currentVersion);
  if (comparison === null) throw new Error(`GitHub returned an invalid release version: ${release.tag_name}`);
  if (comparison <= 0) return null;

  return {
    currentVersion: normalizedVersion(currentVersion),
    latestVersion: normalizedVersion(release.tag_name),
    releaseUrl: validatedReleaseUrl(release.html_url),
  };
}

export function compareVersions(left: string, right: string): number | null {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) return null;

  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index]! - rightVersion.core[index]!;
    if (difference !== 0) return Math.sign(difference);
  }

  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = numericIdentifier(leftPart);
    const rightNumber = numericIdentifier(rightPart);
    if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function parseGitHubRelease(value: unknown): GitHubRelease {
  if (!isRecord(value) || typeof value.tag_name !== "string" || typeof value.html_url !== "string") {
    throw new Error("GitHub returned invalid release information");
  }
  return { tag_name: value.tag_name, html_url: value.html_url };
}

function validatedReleaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(releasePagePrefix)) {
    throw new Error("GitHub returned an invalid release page URL");
  }
  return url.toString();
}

function normalizedVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function parseVersion(value: string): {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[] | null;
} | null {
  const match = normalizedVersion(value).match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? null,
  };
}

function numericIdentifier(value: string): number | null {
  return /^(0|[1-9]\d*)$/.test(value) ? Number(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
