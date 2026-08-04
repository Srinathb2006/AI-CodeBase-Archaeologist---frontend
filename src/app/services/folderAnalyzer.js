// Folder analyzer for webkitdirectory folder uploads.
// Reuses the same ignore rules and content extraction budget as ZIP analysis.

// ── Folders to ignore during analysis ────────────────────────────────────────
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

const TOTAL_CONTENT_BUDGET_BYTES = 3 * 1024 * 1024;
const MAX_FILE_EXTRACT_BYTES = 100_000;

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function shouldIgnorePath(relativePath) {
  const lower = normalizeRelativePath(relativePath).toLowerCase();
  const segments = lower.split("/");

  for (const segment of segments) {
    if (IGNORED_DIRS.includes(segment)) {
      return true;
    }
  }

  const filename = segments[segments.length - 1];
  if (IGNORED_FILES.includes(filename)) {
    return true;
  }

  return false;
}

function computeFolderName(paths) {
  const normalized = paths.map(normalizeRelativePath).filter(Boolean);
  if (normalized.length === 0) return "Local Project";

  const firstSegments = normalized.map((p) => p.split("/")[0]);
  const unique = Array.from(new Set(firstSegments));
  if (unique.length === 1) {
    return unique[0].replace(/\.[^/.]+$/, "") || "Local Project";
  }

  // Fall back to the common prefix if it exists and is not just a file name
  const prefix = normalized.reduce((common, current) => {
    let i = 0;
    const max = Math.min(common.length, current.length);
    while (i < max && common[i] === current[i]) {
      i += 1;
    }
    return common.substring(0, i);
  });

  const sanitized = prefix.replace(/\//g, "/").split("/")[0] || "Local Project";
  return sanitized.replace(/\.[^/.]+$/, "") || "Local Project";
}

export async function analyzeFolderFiles(files) {
  const fileTree = [];
  const fileContents = {};
  const langBytes = {};
  let totalProjectFiles = 0;
  let totalExtractedBytes = 0;

  const fileEntries = Array.from(files)
    .map((file) => {
      const relativePath = normalizeRelativePath(
        file.webkitRelativePath || file.relativePath || file.name
      );
      return { file, relativePath };
    })
    .filter((entry) => entry.relativePath && !shouldIgnorePath(entry.relativePath));

  const folderName = computeFolderName(fileEntries.map((entry) => entry.relativePath));

  const seenDirs = new Set();
  for (const { file, relativePath } of fileEntries) {
    const segments = relativePath.split("/");
    for (let i = 0; i < segments.length - 1; i += 1) {
      const dirPath = segments.slice(0, i + 1).join("/");
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        fileTree.push({ path: dirPath, type: "tree", size: 0 });
      }
    }

    fileTree.push({ path: relativePath, type: "blob", size: file.size });
    totalProjectFiles += 1;

    const ext = relativePath.split(".").pop().toLowerCase();
    const filename = relativePath.split("/").pop().toLowerCase();
    const sourceLang = SOURCE_EXTENSION_MAP[ext];
    const projectLang = PROJECT_EXTENSION_MAP[ext];
    const lang = sourceLang || projectLang;

    if (lang) {
      langBytes[lang] = (langBytes[lang] || 0) + file.size;
    }

    const isKeyFile = KEY_CONFIG_FILES.includes(filename);
    const isSourceCode = Boolean(sourceLang || projectLang);
    const underFileSizeLimit = file.size < MAX_FILE_EXTRACT_BYTES || isKeyFile;
    const underBudget = totalExtractedBytes < TOTAL_CONTENT_BUDGET_BYTES;

    if (underBudget && (isKeyFile || (isSourceCode && underFileSizeLimit))) {
      try {
        const content = await file.text();
        fileContents[relativePath] = content;
        totalExtractedBytes += content.length;
      } catch {
        // ignore unreadable/binary files
      }
    }
  }

  const sortedLangs = Object.entries(langBytes).sort(([, a], [, b]) => b - a);
  const totalBytes = sortedLangs.reduce((sum, [, b]) => sum + b, 0);
  const languages = [];
  let assignedPercentage = 0;

  for (let i = 0; i < sortedLangs.length; i += 1) {
    const [name, bytes] = sortedLangs[i];
    let percentage = 0;
    if (totalBytes > 0) {
      if (i === sortedLangs.length - 1) {
        percentage = parseFloat((100 - assignedPercentage).toFixed(1));
      } else {
        percentage = parseFloat(((bytes / totalBytes) * 100).toFixed(1));
      }
    }
    if (Number.isNaN(percentage) || percentage < 0) {
      percentage = 0;
    }
    assignedPercentage += percentage;
    languages.push({ name, bytes, percentage });
  }

  if (languages.length === 0) {
    languages.push({ name: "Unknown", bytes: 0, percentage: 100 });
  }

  const metadata = {
    name: folderName,
    description: `Imported from local folder upload: ${folderName}`,
    size: Math.round(
      fileEntries.reduce((sum, entry) => sum + entry.file.size, 0) / 1024
    ),
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
