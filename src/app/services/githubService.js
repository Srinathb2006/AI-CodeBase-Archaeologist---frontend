/**
 * Parses a GitHub URL or "owner/repo" string into owner and repo name.
 * @param {string} input 
 * @returns {{owner: string, repo: string} | null}
 */
export function parseGitHubUrl(input) {
  if (!input) return null;
  
  let cleaned = input.trim();
  
  // Remove trailing .git
  if (cleaned.endsWith(".git")) {
    cleaned = cleaned.substring(0, cleaned.length - 4);
  }
  
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");
  
  // Pattern 1: git@github.com:owner/repo
  if (cleaned.startsWith("git@github.com:")) {
    const parts = cleaned.replace("git@github.com:", "").split("/");
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }
  
  // Pattern 2: http(s)://github.com/owner/repo
  try {
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      const url = new URL(cleaned);
      if (url.hostname === "github.com" || url.hostname === "www.github.com") {
        const pathParts = url.pathname.split("/").filter(Boolean);
        if (pathParts.length >= 2) {
          return { owner: pathParts[0], repo: pathParts[1] };
        }
      }
    }
  } catch (e) {
    // Fall through
  }
  
  // Pattern 3: owner/repo
  const parts = cleaned.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  
  return null;
}

/**
 * Common fetch helper that attaches Auth headers and handles errors.
 */
async function fetchFromGitHub(endpoint, token) {
  const url = `https://api.github.com${endpoint}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
  };
  
  // Fallback to localStorage token if not explicitly passed
  const activeToken = token || localStorage.getItem("github_token");
  if (activeToken) {
    headers["Authorization"] = `token ${activeToken}`;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
      if (rateLimitRemaining === "0") {
        throw new Error(
          "GitHub API rate limit exceeded. Please configure a GitHub Personal Access Token in Settings or wait an hour."
        );
      }
    }
    if (response.status === 404) {
      throw new Error(`Repository or resource not found on GitHub (${response.status})`);
    }
    throw new Error(`GitHub API error: ${response.statusText} (${response.status})`);
  }
  
  return response.json();
}

/**
 * Fetches repository metadata.
 */
export async function fetchRepoMetadata(owner, repo, token) {
  return fetchFromGitHub(`/repos/${owner}/${repo}`, token);
}

// ── Directories to exclude from GitHub tree results ──
const GITHUB_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  "coverage",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "bower_components",
  ".gradle",
  ".mvn",
  ".idea",
  ".vscode",
  ".settings",
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".svelte-kit",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
  ".serverless",
  "__macosx",
]);

// Files to always skip from language/file counts
const GITHUB_IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "gemfile.lock",
  "pipfile.lock",
  "poetry.lock",
  "cargo.lock",
]);

/**
 * Returns true if a GitHub tree path should be excluded from analysis.
 */
function shouldIgnoreGitHubPath(filePath) {
  const lower = filePath.toLowerCase().replace(/\\/g, "/");
  const segments = lower.split("/");

  // Check every segment against ignored directories
  for (const segment of segments) {
    if (GITHUB_IGNORED_DIRS.has(segment)) {
      return true;
    }
  }

  // Check filename against ignored files
  const filename = segments[segments.length - 1];
  if (GITHUB_IGNORED_FILES.has(filename)) {
    return true;
  }

  return false;
}

/**
 * Fetches language bytes and converts them to percentages.
 * Ensures percentages sum to exactly 100%.
 */
export async function fetchRepoLanguages(owner, repo, token) {
  const data = await fetchFromGitHub(`/repos/${owner}/${repo}/languages`, token);
  
  const totalBytes = Object.values(data).reduce((sum, bytes) => sum + bytes, 0);
  if (totalBytes === 0) return [];
  
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);
  const languages = [];
  let assignedPercentage = 0;

  for (let i = 0; i < sorted.length; i++) {
    const [name, bytes] = sorted[i];
    let percentage;
    if (i === sorted.length - 1) {
      // Last language gets the remainder so the total is exactly 100
      percentage = parseFloat((100 - assignedPercentage).toFixed(1));
    } else {
      percentage = parseFloat(((bytes / totalBytes) * 100).toFixed(1));
    }
    assignedPercentage += percentage;
    languages.push({ name, bytes, percentage });
  }

  return languages;
}

/**
 * Fetches the git tree recursively, filtering out dependency/generated directories.
 */
export async function fetchRepoTree(owner, repo, branch = "main", token) {
  try {
    const data = await fetchFromGitHub(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token);
    const filteredTree = (data.tree || []).filter(
      (node) => !shouldIgnoreGitHubPath(node.path)
    );
    return {
      tree: filteredTree,
      truncated: !!data.truncated,
    };
  } catch (error) {
    // If main fails, try master branch as a fallback
    if (branch === "main") {
      try {
        const data = await fetchFromGitHub(`/repos/${owner}/${repo}/git/trees/master?recursive=1`, token);
        const filteredTree = (data.tree || []).filter(
          (node) => !shouldIgnoreGitHubPath(node.path)
        );
        return {
          tree: filteredTree,
          truncated: !!data.truncated,
          fallbackBranch: "master"
        };
      } catch (masterError) {
        throw error; // throw original main branch error if both fail
      }
    }
    throw error;
  }
}
