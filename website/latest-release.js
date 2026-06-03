const owner = window.ORISYN_GITHUB_OWNER;
const repo = window.ORISYN_GITHUB_REPO;
const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
const autoHideNonMatchingOS = true;

const versionText = document.getElementById("versionText");
const statusText = document.getElementById("statusText");
const windowsButton = document.getElementById("windowsButton");
const macButton = document.getElementById("macButton");

function setButtonState(button, enabled, href) {
  if (!button) return;

  if (enabled && href) {
    button.href = href;
    button.setAttribute("aria-disabled", "false");
    return;
  }

  button.href = "#";
  button.setAttribute("aria-disabled", "true");
}

function detectOS() {
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "other";
}

function applyOSPreference() {
  if (!autoHideNonMatchingOS) return;

  const os = detectOS();
  if (os === "windows") {
    macButton?.setAttribute("hidden", "hidden");
    return;
  }

  if (os === "mac") {
    windowsButton?.setAttribute("hidden", "hidden");
  }
}

function pickAssets(assets) {
  const picked = {
    windows: "",
    mac: "",
  };

  for (const asset of assets || []) {
    const name = (asset.name || "").toLowerCase();
    const url = asset.browser_download_url || "";

    if (!picked.windows && name.endsWith(".exe")) {
      picked.windows = url;
      continue;
    }

    if (!picked.mac && name.endsWith(".dmg")) {
      picked.mac = url;
    }
  }

  return picked;
}

async function loadLatestRelease() {
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const release = await response.json();
    const version = release.tag_name || "Unknown";
    const assets = pickAssets(release.assets);

    versionText.textContent = `Latest Version: ${version}`;
    setButtonState(windowsButton, Boolean(assets.windows), assets.windows);
    setButtonState(macButton, Boolean(assets.mac), assets.mac);

    if (!assets.windows && !assets.mac) {
      statusText.textContent = "Latest release found, but no .exe/.dmg installers are attached.";
      return;
    }

    statusText.textContent = "Download links updated from GitHub Releases.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    statusText.textContent = `Failed to fetch release metadata: ${message}`;
    versionText.textContent = "Latest Version: Unavailable";
    setButtonState(windowsButton, false, "");
    setButtonState(macButton, false, "");
  }
}

applyOSPreference();
void loadLatestRelease();
