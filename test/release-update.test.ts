import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, findAvailableUpdate, type ReleaseRequest } from "../src/release-update.js";

test("compares semantic release versions", () => {
  assert.equal(compareVersions("v1.4.0", "1.3.9"), 1);
  assert.equal(compareVersions("1.3.9", "v1.4.0"), -1);
  assert.equal(compareVersions("1.4.0", "v1.4.0"), 0);
  assert.equal(compareVersions("1.4.0", "1.4.0-beta.2"), 1);
  assert.equal(compareVersions("1.4.0-beta.10", "1.4.0-beta.2"), 1);
  assert.equal(compareVersions("not-a-version", "1.4.0"), null);
});

test("returns the latest GitHub release when it is newer", async () => {
  const request: ReleaseRequest = async (url, init) => {
    assert.equal(url, "https://api.github.com/repos/nick-rakoczy/animation-study/releases/latest");
    assert.equal((init.headers as Record<string, string>)["User-Agent"], "Animation-Study");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v0.2.0",
        html_url: "https://github.com/nick-rakoczy/animation-study/releases/tag/v0.2.0",
      }),
    };
  };

  assert.deepEqual(await findAvailableUpdate("0.1.0", request), {
    currentVersion: "0.1.0",
    latestVersion: "0.2.0",
    releaseUrl: "https://github.com/nick-rakoczy/animation-study/releases/tag/v0.2.0",
  });
});

test("does not offer the current or an older release", async () => {
  for (const tag of ["v0.1.0", "v0.0.9"]) {
    const request: ReleaseRequest = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: tag,
        html_url: `https://github.com/nick-rakoczy/animation-study/releases/tag/${tag}`,
      }),
    });
    assert.equal(await findAvailableUpdate("0.1.0", request), null);
  }
});

test("treats a repository with no releases as up to date", async () => {
  const request: ReleaseRequest = async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  });
  assert.equal(await findAvailableUpdate("0.1.0", request), null);
});

test("rejects release links outside the project repository", async () => {
  const request: ReleaseRequest = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://example.com/download",
    }),
  });
  await assert.rejects(findAvailableUpdate("0.1.0", request), /invalid release page URL/);
});
