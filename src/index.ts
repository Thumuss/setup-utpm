#!/usr/bin/env node
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import fs from "fs";
import path from "path";
import * as semver from "semver";

async function listReleases(
  octokit: any,
  repoSet: { owner: string; repo: string }
) {
  core.info(
    `Fetching releases list for repository ${repoSet.owner}/${repoSet.repo}.`
  );
  if (octokit) {
    return await octokit.paginate(octokit.rest.repos.listReleases, repoSet);
  } else {
    const releasesUrl = `https://api.github.com/repos/${repoSet.owner}/${repoSet.repo}/releases`;
    core.debug(
      `Fetching releases list from ${releasesUrl} without authentication.`
    );
    const releasesResponse = await tc.downloadTool(releasesUrl);
    try {
      core.debug(`Successfully downloaded releases list from ${releasesUrl}.`);
      return JSON.parse(fs.readFileSync(releasesResponse, "utf8"));
    } catch (error) {
      core.setFailed(
        `Failed to parse releases from ${releasesUrl}: ${
          (error as Error).message
        }. This may be caused by API rate limit exceeded.`
      );
      process.exit(1);
    }
  }
}

async function getExactVersion(releases: any[], version: string) {
  const versions = releases
    .map((release) => release.tag_name.replace(/^v/, ""))
    .filter((v) => semver.valid(v));
  
  const resolvedVersion = semver.maxSatisfying(
    versions,
    version === "latest" ? "*" : version
  );
  
  if (resolvedVersion) {
    core.info(`Resolved UTPM version: ${resolvedVersion}.`);
  } else {
    core.setFailed(`UTPM ${version} could not be resolved.`);
    process.exit(1);
  }
  return resolvedVersion;
}

async function downloadAndCacheUtpm(version: string) {
  core.info(`Downloading and caching UTPM ${version}.`);
  
  // Try musl first for Linux, fallback to gnu if not available
  const targets = {
    "darwin,arm64": ["aarch64-apple-darwin"],
    "darwin,x64": ["x86_64-apple-darwin"],
    "linux,x64": ["x86_64-unknown-linux-musl", "x86_64-unknown-linux-gnu"],
    "linux,arm64": ["aarch64-unknown-linux-gnu"],
    "win32,x64": ["x86_64-pc-windows-msvc"],
    "win32,arm64": ["aarch64-pc-windows-msvc"],
  };
  
  const platformKey = [process.platform, process.arch].join(",");
  const possibleTargets = targets[platformKey as keyof typeof targets];
  
  if (!possibleTargets) {
    core.setFailed(
      `Unsupported platform: ${process.platform}-${process.arch}`
    );
    process.exit(1);
  }
  
  const archiveExt = process.platform === "win32" ? ".zip" : ".tar.gz";
  const binaryName = process.platform === "win32" ? "utpm.exe" : "utpm";
  
  // Try each possible target until one works
  let downloaded: string | null = null;
  let target: string | null = null;
  
  for (const candidateTarget of possibleTargets) {
    const file = `utpm-${candidateTarget}${archiveExt}`;
    const downloadUrl = `https://github.com/typst-community/utpm/releases/download/v${version}/${file}`;
    
    core.info(`Attempting to download from ${downloadUrl}`);
    
    try {
      downloaded = await tc.downloadTool(downloadUrl);
      
      // Verify download
      if (fs.existsSync(downloaded) && fs.statSync(downloaded).size > 0) {
        target = candidateTarget;
        core.info(`Successfully downloaded UTPM for target: ${target}`);
        break;
      }
    } catch (error) {
      core.debug(`Failed to download ${candidateTarget}: ${(error as Error).message}`);
      continue;
    }
  }
  
  if (!downloaded || !target) {
    core.setFailed(`Failed to download UTPM v${version} for any compatible target`);
    process.exit(1);
  }
  
  core.debug(`Determined target: ${target}, archive extension: ${archiveExt}.`);
  
  let extracted: string;
  
  if (process.platform === "win32") {
    // Ensure .zip extension for Windows
    if (!downloaded.endsWith(".zip")) {
      const zipPath = `${downloaded}.zip`;
      fs.renameSync(downloaded, zipPath);
      downloaded = zipPath;
    }
    extracted = await tc.extractZip(downloaded);
  } else {
    extracted = await tc.extractTar(downloaded);
  }
  
  core.debug(`Extracted archive for UTPM version ${version}.`);
  
  // Find the binary in the extracted directory
  const binaryPath = path.join(extracted, binaryName);
  
  if (!fs.existsSync(binaryPath)) {
    core.setFailed(`Binary not found at ${binaryPath}`);
    process.exit(1);
  }
  
  // Cache the extracted directory
  const cachedPath = await tc.cacheDir(extracted, "utpm", version);
  core.info(`UTPM ${version} added to cache at '${cachedPath}'.`);
  
  return cachedPath;
}

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = token
      ? github.getOctokit(token, { baseUrl: "https://api.github.com" })
      : null;
    
    const repoSet = {
      owner: "typst-community",
      repo: "utpm",
    };
    
    const releases = await listReleases(octokit, repoSet);
    const version = core.getInput("version") || "latest";
    const versionExact = await getExactVersion(releases, version);
    
    let found = tc.find("utpm", versionExact);
    core.setOutput("cache-hit", !!found);
    
    if (!found) {
      found = await downloadAndCacheUtpm(versionExact);
    } else {
      core.info(`✅ UTPM v${versionExact} restored from tool cache.`);
    }
    
    core.addPath(found);
    core.setOutput("version", versionExact);
    core.info(`✅ UTPM v${versionExact} installed successfully!`);
  } catch (error) {
    core.setFailed(`Action failed: ${(error as Error).message}`);
  }
}

run();
