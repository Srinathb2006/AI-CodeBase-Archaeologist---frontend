/**
 * codeRetriever.js
 *
 * Relevance-based file retrieval for repository-aware AI chat.
 *
 * Given a user's natural-language query and a map of { filePath → fileContent },
 * this module scores every file and returns the top-N most relevant ones with
 * appropriate character budgets — so the AI always gets real code for the
 * specific question asked, without blowing up the context window.
 */

// ─── File priority tiers ──────────────────────────────────────────────────────
// Higher = more likely to be included even when query match is weak.

const SOURCE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "rb", "php",
  "c", "cpp", "cc", "h", "hpp", "cs", "swift", "kt", "kts", "dart",
  "scala", "vue", "svelte", "ex", "exs", "hs", "clj", "jl", "pl", "lua",
  "sh", "ps1", "r", "m",
]);

const CONFIG_FILENAMES = new Set([
  "package.json", "pom.xml", "build.gradle", "build.gradle.kts",
  "requirements.txt", "setup.py", "pyproject.toml", "go.mod", "cargo.toml",
  "dockerfile", "docker-compose.yml", "docker-compose.yaml",
  "tsconfig.json", "vite.config.js", "vite.config.ts", "vite.config.mjs",
  "next.config.js", "next.config.mjs", "angular.json", "webpack.config.js",
  "application.properties", "application.yml", "jest.config.js",
  "jest.config.ts", "vitest.config.ts", ".eslintrc.json", ".eslintrc.js",
]);

const README_PATTERN = /^readme(\.\w+)?$/i;

// Priority scores (added on top of relevance score)
const TIER_BONUS = {
  readme:  22,
  source:  18,
  config:  12,
  markup:   6,
  other:    0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the extension of a file path (lowercase, no dot).
 */
function getExt(filePath) {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * Returns the basename of a file path (lowercase).
 */
function getBasename(filePath) {
  return filePath.split("/").pop().toLowerCase();
}

/**
 * Determines the priority tier of a file.
 * @returns {"readme"|"source"|"config"|"markup"|"other"}
 */
function getFileTier(filePath) {
  const basename = getBasename(filePath);
  const ext = getExt(filePath);

  if (README_PATTERN.test(basename)) return "readme";
  if (CONFIG_FILENAMES.has(basename))  return "config";
  if (SOURCE_EXTENSIONS.has(ext))      return "source";
  if (["html", "css", "scss", "sass", "less", "md", "mdx"].includes(ext)) return "markup";
  return "other";
}

/**
 * Tokenises a string into an array of lowercase words (≥2 chars).
 * Splits on whitespace and common delimiters (/, ., _, -, camelCase boundaries).
 */
function tokenise(text) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // split camelCase
    .toLowerCase()
    .split(/[\s/._\-,:;()\[\]{}<>'"`|\\@#$%^&*+=!?~]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Builds a Set of unique tokens from the query, plus common programming synonyms.
 * E.g. "auth" also matches "authentication", "login", "session".
 */
const SYNONYMS = {
  auth:         ["authentication", "login", "session", "jwt", "token", "oauth", "signin", "signup"],
  authentication: ["auth", "login", "session", "jwt", "token"],
  login:        ["auth", "authentication", "signin", "session"],
  api:          ["endpoint", "route", "controller", "handler", "rest", "graphql"],
  route:        ["router", "endpoint", "api", "controller", "handler", "path"],
  database:     ["db", "model", "schema", "migration", "entity", "repository", "query", "orm"],
  db:           ["database", "model", "schema", "query"],
  component:    ["widget", "view", "page", "ui", "render"],
  test:         ["spec", "testing", "jest", "vitest", "mocha", "cypress"],
  config:       ["configuration", "settings", "env", "environment"],
  style:        ["css", "scss", "sass", "theme", "tailwind", "styled"],
  deploy:       ["deployment", "docker", "ci", "cd", "pipeline", "kubernetes", "k8s"],
  util:         ["utility", "helper", "utils", "helpers", "common", "shared"],
  service:      ["services", "provider", "client", "manager"],
};

function buildQueryTokens(query) {
  const base = tokenise(query);
  const expanded = new Set(base);
  for (const token of base) {
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach((s) => expanded.add(s));
    }
  }
  return expanded;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Scores a single file against the query.
 *
 * Scoring breakdown (max ~100 before tier bonus):
 *   Path match:    up to 40 pts (10 per matching token, capped)
 *   Content match: up to 40 pts (proportional to match density)
 *   Tier bonus:    up to 22 pts (fixed per tier)
 *
 * @param {string} filePath
 * @param {string} fileContent
 * @param {Set<string>} queryTokens  Expanded token set from buildQueryTokens()
 * @returns {number} score
 */
function scoreFile(filePath, fileContent, queryTokens) {
  if (!filePath || queryTokens.size === 0) return 0;

  const pathTokens  = tokenise(filePath);
  const tier        = getFileTier(filePath);

  // ── Path score ──
  let pathScore = 0;
  for (const pt of pathTokens) {
    if (queryTokens.has(pt)) pathScore += 10;
  }
  pathScore = Math.min(pathScore, 40);

  // ── Content score ──
  let contentScore = 0;
  if (fileContent && fileContent.length > 0) {
    const contentLower = fileContent.toLowerCase();
    let hits = 0;
    for (const qt of queryTokens) {
      // Count occurrences (cap at 5 per token to avoid spam)
      let idx = 0;
      let count = 0;
      while ((idx = contentLower.indexOf(qt, idx)) !== -1 && count < 5) {
        hits++;
        count++;
        idx += qt.length;
      }
    }
    // Normalise: 1 hit per 500 chars of content = score 1, cap at 40
    const density = hits / Math.max(fileContent.length / 500, 1);
    contentScore = Math.min(Math.round(density * 10), 40);
  }

  const tierBonus = TIER_BONUS[tier] || 0;

  return pathScore + contentScore + tierBonus;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Default options for retrieveRelevantFiles.
 */
const DEFAULT_OPTIONS = {
  maxFiles:       8,     // maximum number of files to return
  maxTotalChars:  40000, // total character budget across all files
  topFileChars:   6000,  // char budget for the top-3 files
  restFileChars:  3000,  // char budget for files 4+
  readmeChars:    2000,  // char budget for README (always included)
  configChars:     800,  // char budget for manifest/config files (always included)
  minScore:          5,  // files below this score are excluded
};

/**
 * Retrieves the most relevant files for a given query.
 *
 * @param {Object<string,string>} fileContents  Map of { filePath → content }
 * @param {string}                query         The user's natural-language question
 * @param {object}               [options]      Override DEFAULT_OPTIONS fields
 * @returns {Array<{path, content, score, tier, charBudget}>}
 */
export function retrieveRelevantFiles(fileContents, query, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!fileContents || Object.keys(fileContents).length === 0) return [];

  const queryTokens = buildQueryTokens(query);

  // Score all files
  const scored = Object.entries(fileContents).map(([path, content]) => ({
    path,
    content,
    score: scoreFile(path, content, queryTokens),
    tier:  getFileTier(path),
  }));

  // Always-include sets (README + manifests)
  const alwaysInclude = scored.filter(
    (f) => f.tier === "readme" || CONFIG_FILENAMES.has(getBasename(f.path))
  );

  // Ranked remainder (excluding always-include, above minScore threshold)
  const alwaysPaths = new Set(alwaysInclude.map((f) => f.path));
  const ranked = scored
    .filter((f) => !alwaysPaths.has(f.path) && f.score >= opts.minScore)
    .sort((a, b) => b.score - a.score);

  // Build final list: always-include first, then top ranked
  const slotsLeft = opts.maxFiles - alwaysInclude.length;
  const topRanked = slotsLeft > 0 ? ranked.slice(0, slotsLeft) : [];

  // Merge: put always-include at the bottom (context, not primary answer)
  const merged = [...topRanked, ...alwaysInclude];

  // Assign character budgets and truncate
  let usedChars = 0;
  const result = [];

  for (let i = 0; i < merged.length; i++) {
    const file = merged[i];
    let budget;

    if (file.tier === "readme") {
      budget = opts.readmeChars;
    } else if (CONFIG_FILENAMES.has(getBasename(file.path))) {
      budget = opts.configChars;
    } else if (i < 3) {
      budget = opts.topFileChars;
    } else {
      budget = opts.restFileChars;
    }

    if (usedChars + budget > opts.maxTotalChars) {
      budget = Math.max(0, opts.maxTotalChars - usedChars);
    }
    if (budget <= 0) break;

    const truncated = file.content.substring(0, budget);
    const wasTruncated = file.content.length > budget;

    result.push({
      path:        file.path,
      content:     truncated,
      score:       file.score,
      tier:        file.tier,
      charBudget:  budget,
      truncated:   wasTruncated,
    });

    usedChars += truncated.length;
  }

  return result;
}

/**
 * Formats retrieved files into a prompt-ready string block.
 *
 * @param {Array} retrievedFiles  Output of retrieveRelevantFiles()
 * @returns {string}
 */
export function formatRetrievedFiles(retrievedFiles) {
  if (!retrievedFiles || retrievedFiles.length === 0) {
    return "(No source files available for this repository.)";
  }

  return retrievedFiles
    .map((file) => {
      const ext    = getExt(file.path);
      const trunc  = file.truncated ? `\n// ... [truncated at ${file.charBudget} chars]` : "";
      const header = `### ${file.path}  (relevance: ${file.score})`;
      return `${header}\n\`\`\`${ext || "text"}\n${file.content}${trunc}\n\`\`\``;
    })
    .join("\n\n");
}

/**
 * Returns the number of files stored in fileContents.
 * Safe to call even when fileContents is undefined/null.
 *
 * @param {Object|null|undefined} fileContents
 * @returns {number}
 */
export function countIndexedFiles(fileContents) {
  if (!fileContents) return 0;
  return Object.keys(fileContents).length;
}
