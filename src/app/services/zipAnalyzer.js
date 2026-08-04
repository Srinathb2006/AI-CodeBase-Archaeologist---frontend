import JSZip from "jszip";

// ── Folders to always exclude (dependencies, generated output, caches) ──
const IGNORED_DIRS = [
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
  "__MACOSX",
  ".DS_Store",
  "Thumbs.db",
];

// Files to always skip (lock files, binary assets, etc.)
const IGNORED_FILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "poetry.lock",
  "Cargo.lock",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".yarnrc",
  ".prettierignore",
  ".eslintignore",
];

// ── Source code extensions → language name ──
const SOURCE_EXTENSION_MAP = {
  js: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  py: "Python",
  java: "Java",
  cpp: "C++",
  h: "C++",
  hpp: "C++",
  cc: "C++",
  c: "C",
  cs: "C#",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell",
  ps1: "PowerShell",
  swift: "Swift",
  kt: "Kotlin",
  kts: "Kotlin",
  dart: "Dart",
  scala: "Scala",
  m: "Objective-C",
  r: "R",
  vue: "Vue",
  svelte: "Svelte",
  lua: "Lua",
  hs: "Haskell",
  clj: "Clojure",
  ex: "Elixir",
  exs: "Elixir",
  jl: "Julia",
  pl: "Perl",
};

// Secondary extensions included in file tree but NOT in language byte counts
const PROJECT_EXTENSION_MAP = {
  html: "HTML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  less: "CSS",
  graphql: "GraphQL",
  gql: "GraphQL",
  sql: "SQL",
  json: "JSON",
  md: "Markdown",
  yaml: "YAML",
  yml: "YAML",
};

// Configuration / project files we always want in the tree and may extract content from
const KEY_CONFIG_FILES = [
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "requirements.txt",
  "setup.py",
  "pyproject.toml",
  "go.mod",
  "cargo.toml",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "application.properties",
  "application.yml",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.ts",
  "vite.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "angular.json",
  "svelte.config.js",
  "nuxt.config.ts",
  "nuxt.config.js",
  "webpack.config.js",
  "webpack.config.ts",
  "rollup.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.mjs",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "readme.md",
  ".env.example",
];

/**
 * Checks whether a ZIP entry path should be excluded from analysis.
 * @param {string} relativePath - the path inside the ZIP
 * @returns {boolean}
 */
function shouldIgnorePath(relativePath) {
  const lower = relativePath.toLowerCase();

  // Check every path segment against ignored directory names
  const segments = lower.replace(/\\/g, "/").split("/");
  for (const segment of segments) {
    if (IGNORED_DIRS.some((dir) => dir.toLowerCase() === segment)) {
      return true;
    }
  }

  // Check filename against ignored file list
  const filename = segments[segments.length - 1];
  if (IGNORED_FILES.some((f) => f.toLowerCase() === filename)) {
    return true;
  }

  return false;
}

/**
 * Analyzes a ZIP file, extracts metadata, builds file tree, and detects languages.
 * Only counts source code and project configuration files — excludes
 * node_modules, .git, dist, build, target, .next, coverage, vendor, and other
 * generated/dependency folders.
 *
 * @param {File} file - Browser File object
 * @returns {Promise<object>} Analysis results
 */
// Maximum total characters stored across all extracted file contents (~3 MB).
// Prevents localStorage overflow on large repositories.
const TOTAL_CONTENT_BUDGET_BYTES = 3 * 1024 * 1024; // 3 MB

// Maximum size of a single file to extract (100 KB).
const MAX_FILE_EXTRACT_BYTES = 100_000;

export async function analyzeZipFile(file) {
  const zip = await JSZip.loadAsync(file);

  const fileTree = [];
  const fileContents = {};
  const langBytes = {};
  let totalSourceBytes = 0;
  let sourceFileCount = 0;
  let totalProjectFiles = 0;
  let totalExtractedBytes = 0; // running total for budget cap

  const paths = Object.keys(zip.files);

  // 1. Detect common root directory prefix (e.g. "repo-name-main/")
  const activePaths = paths.filter((p) => !shouldIgnorePath(p));

  let commonPrefix = "";
  if (activePaths.length > 0) {
    const firstPath = activePaths[0];
    const slashIdx = firstPath.indexOf("/");
    if (slashIdx !== -1) {
      const prefix = firstPath.substring(0, slashIdx + 1);
      const isCommon = activePaths.every((p) => p.startsWith(prefix));
      if (isCommon) {
        commonPrefix = prefix;
      }
    }
  }

  // 2. Scan entries — filter out ignored directories and files
  for (const relativePath of paths) {
    if (shouldIgnorePath(relativePath)) {
      continue;
    }

    const fileEntry = zip.files[relativePath];
    const cleanPath =
      commonPrefix && relativePath.startsWith(commonPrefix)
        ? relativePath.substring(commonPrefix.length)
        : relativePath;

    if (!cleanPath) continue; // Skip the root directory itself

    const size = (() => {
      const d = fileEntry._data;
      if (!d) return 0;
      if (typeof d.uncompressedSize === "number" && d.uncompressedSize > 0) return d.uncompressedSize;
      if (typeof d.length === "number" && d.length > 0) return d.length;
      if (d instanceof Uint8Array) return d.byteLength;
      if (d.buffer instanceof ArrayBuffer) return d.buffer.byteLength;
      return 0;
    })();
    const isDir = fileEntry.dir;

    fileTree.push({
      path: cleanPath,
      type: isDir ? "tree" : "blob",
      size: size,
    });

    if (!isDir) {
      totalProjectFiles++;

      const ext = cleanPath.split(".").pop().toLowerCase();
      const filename = cleanPath.split("/").pop().toLowerCase();

      // Determine if this is a source code file (counts toward language stats)
      const sourceLang = SOURCE_EXTENSION_MAP[ext];
      const projectLang = PROJECT_EXTENSION_MAP[ext];
      const lang = sourceLang || projectLang;

      if (lang) {
        langBytes[lang] = (langBytes[lang] || 0) + size;
        totalSourceBytes += size;
        if (sourceLang) {
          sourceFileCount++;
        }
      }

      // Extract content from key configuration files or source code files under MAX_FILE_EXTRACT_BYTES,
      // subject to the overall TOTAL_CONTENT_BUDGET_BYTES cap.
      const isKeyFile = KEY_CONFIG_FILES.includes(filename);
      const isSourceCode = SOURCE_EXTENSION_MAP[ext] || PROJECT_EXTENSION_MAP[ext];
      const underFileSizeLimit = size < MAX_FILE_EXTRACT_BYTES || isKeyFile;
      const underBudget = totalExtractedBytes < TOTAL_CONTENT_BUDGET_BYTES;

      if (underBudget && (isKeyFile || (isSourceCode && underFileSizeLimit))) {
        try {
          const content = await fileEntry.async("text");
          fileContents[cleanPath] = content;
          totalExtractedBytes += content.length;
        } catch {
          // binary or corrupt — skip silently
        }
      }
    }
  }

  // 3. Calculate language percentages — ensure they sum to exactly 100%
  const sortedLangs = Object.entries(langBytes).sort(
    ([, a], [, b]) => b - a
  );
  
  const totalBytes = sortedLangs.reduce((sum, [, b]) => sum + b, 0);
  const languages = [];
  let assignedPercentage = 0;

  for (let i = 0; i < sortedLangs.length; i++) {
    const [name, bytes] = sortedLangs[i];
    let percentage = 0;
    
    if (totalBytes > 0) {
      if (i === sortedLangs.length - 1) {
        // Last language gets the remainder to ensure sum = 100
        percentage = parseFloat((100 - assignedPercentage).toFixed(1));
      } else {
        percentage = parseFloat(((bytes / totalBytes) * 100).toFixed(1));
      }
    }
    
    // Safety check to ensure percentage is a valid positive number
    if (isNaN(percentage) || percentage < 0) {
      percentage = 0;
    }
    
    assignedPercentage += percentage;
    languages.push({ name, bytes, percentage });
  }

  // Safety: if there are zero languages, avoid empty chart
  if (languages.length === 0) {
    languages.push({ name: "Unknown", bytes: 0, percentage: 100 });
  }

  // 4. Build repository metadata from ZIP file info
  const metadata = {
    name: file.name.replace(/\.[^/.]+$/, ""),
    description: `Imported from ZIP file: ${file.name}`,
    size: Math.round(file.size / 1024),
    stars: 0,
    forks: 0,
    watchers: 0,
    default_branch: "main",
    topics: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    metadata,
    languages,
    fileTree,
    fileContents,
    fileCount: totalProjectFiles,
  };
}
