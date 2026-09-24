import { apiRequest } from "./apiClient";
import { getLanguageColor } from "./languageColors";
import { analyzeRepository } from "./repoAnalyzer";

function extensionFromPath(path = "") {
  const filename = path.split("/").pop() || "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : "";
}

const SOURCE_EXTENSION_MAP = {
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  py: "Python",
  pyw: "Python",
  java: "Java",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  h: "C++",
  hpp: "C++",
  c: "C",
  cs: "C#",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
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

const IGNORED_LANGUAGE_DIRS = new Set([
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
  ".idea",
  ".vscode",
  ".output",
  ".turbo",
  "__macosx",
]);

const IGNORED_LANGUAGE_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "gemfile.lock",
  "pipfile.lock",
  "poetry.lock",
  "cargo.lock",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  "license",
  "license.txt",
  "license.md",
  "readme.md",
  "changelog.md",
  ".ds_store",
  "thumbs.db",
]);

function isIgnoredLanguageFile(relativePath = "") {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/");
  if (segments.some((seg) => IGNORED_LANGUAGE_DIRS.has(seg))) return true;
  const filename = segments.pop() || "";
  return IGNORED_LANGUAGE_FILES.has(filename);
}

function summarizeLanguages(files = []) {
  const bytesByLanguage = new Map();
  let totalSourceBytes = 0;

  // Pass 1: Count true programming languages, ignoring lockfiles, configs, and non-code
  files
    .filter((file) => file.type === "FILE" && !isIgnoredLanguageFile(file.relativePath || file.name || ""))
    .forEach((file) => {
      const ext = extensionFromPath(file.relativePath || file.name || "");
      const lang = SOURCE_EXTENSION_MAP[ext];
      if (lang) {
        const size = Number(file.sizeBytes) || 0;
        bytesByLanguage.set(lang, (bytesByLanguage.get(lang) || 0) + size);
        totalSourceBytes += size;
      }
    });

  // Pass 2: Fallback for static HTML/CSS websites ONLY when no programming languages exist
  if (totalSourceBytes === 0) {
    files
      .filter((file) => file.type === "FILE" && !isIgnoredLanguageFile(file.relativePath || file.name || ""))
      .forEach((file) => {
        const ext = extensionFromPath(file.relativePath || file.name || "");
        if (ext === "html" || ext === "htm") {
          const size = Number(file.sizeBytes) || 0;
          bytesByLanguage.set("HTML", (bytesByLanguage.get("HTML") || 0) + size);
          totalSourceBytes += size;
        } else if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") {
          const size = Number(file.sizeBytes) || 0;
          bytesByLanguage.set("CSS", (bytesByLanguage.get("CSS") || 0) + size);
          totalSourceBytes += size;
        }
      });
  }

  if (bytesByLanguage.size === 0) {
    return [{ name: "Unknown", value: 100, bytes: 0, color: getLanguageColor("Unknown") }];
  }

  const entries = Array.from(bytesByLanguage.entries()).sort((a, b) => b[1] - a[1]);
  let assigned = 0;

  return entries.map(([name, bytes], index) => {
    const value = totalSourceBytes > 0
      ? index === entries.length - 1
        ? Number((100 - assigned).toFixed(1))
        : Number(((bytes / totalSourceBytes) * 100).toFixed(1))
      : 0;
    assigned += value;
    return { name, value, bytes, color: getLanguageColor(name) };
  });
}

function mapBackendRepository(response) {
  const summary = response?.repository || response;
  const files = response?.files || [];
  const fileTree = files.map((file) => ({
    path: file.relativePath,
    type: file.type === "DIRECTORY" ? "tree" : "blob",
    size: file.sizeBytes || 0,
  }));
  const languages = summarizeLanguages(files);
  const fileContents = files.reduce((contents, file) => {
    if (file.type === "FILE" && file.relativePath && typeof file.sourceContent === "string") {
      contents[file.relativePath] = file.sourceContent;
    }
    return contents;
  }, {});
  const uploadedAt = summary.uploadedAt ? new Date(summary.uploadedAt) : new Date();
  const primaryLanguage = languages[0]?.name || "Unknown";

  const techAnalysis = analyzeRepository(fileTree, fileContents);

  return {
    id: summary.id,
    backendId: summary.id,
    name: summary.name,
    description: `Uploaded ZIP repository: ${summary.originalFilename || summary.name}`,
    language: primaryLanguage,
    files: summary.fileCount || files.filter((file) => file.type === "FILE").length,
    directories: summary.directoryCount || files.filter((file) => file.type === "DIRECTORY").length,
    maxDepth: summary.maxDepth || 0,
    compressedSizeBytes: summary.compressedSizeBytes || 0,
    extractedSizeBytes: summary.extractedSizeBytes || 0,
    lastAnalyzed: uploadedAt.toLocaleString(),
    status: summary.status === "READY" ? "completed" : String(summary.status || "processing").toLowerCase(),
    languages,
    technologies: techAnalysis.technologies,
    frameworks: techAnalysis.frameworks,
    buildTools: techAnalysis.buildTools,
    tools: techAnalysis.tools,
    architecturePatterns: techAnalysis.architecturePatterns,
    technologyStack: techAnalysis.technologyStack,
    architecture: null,
    fileTree,
    fileContents,
    aiSummary: null,
    stars: 0,
    forks: 0,
    watchers: 0,
    defaultBranch: "main",
    type: "zip",
  };
}

export async function uploadRepositoryZip(file, name) {
  const formData = new FormData();
  formData.append("file", file);
  if (name?.trim()) {
    formData.append("name", name.trim());
  }

  const response = await apiRequest("/api/repositories", {
    method: "POST",
    body: formData,
  });

  return mapBackendRepository(response);
}

export async function importGitHubRepository(url, name) {
  const response = await apiRequest("/api/repositories/github", {
    method: "POST",
    body: JSON.stringify({
      url: url.trim(),
      name: name?.trim() || undefined,
    }),
  });

  return mapBackendRepository(response);
}

export async function getRepositories() {
  const response = await apiRequest("/api/repositories");
  return Array.isArray(response) ? response.map(mapBackendRepository) : [];
}

export async function getRepository(id) {
  const response = await apiRequest(`/api/repositories/${id}`);
  return mapBackendRepository(response);
}

export async function getRepositoryFileContent(id, filePath) {
  return await apiRequest(`/api/repositories/${id}/files/content?path=${encodeURIComponent(filePath)}`);
}

export async function getRepositoryGraph(id) {
  return await apiRequest(`/api/repositories/${id}/graph`);
}

export async function addRepository(repo) {
  if (repo?.sourceFile instanceof File) {
    return uploadRepositoryZip(repo.sourceFile, repo.name);
  }
  if (repo?.githubUrl || repo?.url) {
    return importGitHubRepository(repo.githubUrl || repo.url, repo.name);
  }
  throw new Error("Backend repository creation requires a ZIP file upload or GitHub URL.");
}

export async function updateRepository(id, updates) {
  return { id, ...updates };
}

export async function deleteRepository(id) {
  await apiRequest(`/api/repositories/${id}`, { method: "DELETE" });
  return true;
}

export async function getChatHistory(repoId) {
  const key = `archaeologist_chat_${repoId}`;
  try {
    return JSON.parse(sessionStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export async function saveChatHistory(repoId, messages) {
  sessionStorage.setItem(`archaeologist_chat_${repoId}`, JSON.stringify(messages));
  return true;
}
