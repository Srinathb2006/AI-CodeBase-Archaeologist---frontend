import { apiRequest } from "./apiClient";
import { getLanguageColor } from "./languageColors";

function extensionFromPath(path = "") {
  const filename = path.split("/").pop() || "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : "";
}

function languageFromExtension(ext) {
  const map = {
    java: "Java",
    js: "JavaScript",
    jsx: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    cs: "C#",
    cpp: "C++",
    c: "C",
    h: "C/C++ Header",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    json: "JSON",
    xml: "XML",
    yml: "YAML",
    yaml: "YAML",
    md: "Markdown",
    sql: "SQL",
    sh: "Shell",
    ps1: "PowerShell",
    kt: "Kotlin",
    php: "PHP",
  };
  return map[ext] || "Unknown";
}

function summarizeLanguages(files = []) {
  const bytesByLanguage = new Map();
  files
    .filter((file) => file.type === "FILE")
    .forEach((file) => {
      const language = file.language || languageFromExtension(file.extension || extensionFromPath(file.relativePath));
      bytesByLanguage.set(language, (bytesByLanguage.get(language) || 0) + (file.sizeBytes || 0));
    });

  if (bytesByLanguage.size === 0) {
    return [{ name: "Unknown", value: 100, bytes: 0, color: getLanguageColor("Unknown") }];
  }

  const entries = Array.from(bytesByLanguage.entries()).sort((a, b) => b[1] - a[1]);
  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  let assigned = 0;

  return entries.map(([name, bytes], index) => {
    const value = totalBytes > 0
      ? index === entries.length - 1
        ? Number((100 - assigned).toFixed(1))
        : Number(((bytes / totalBytes) * 100).toFixed(1))
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
  const uploadedAt = summary.uploadedAt ? new Date(summary.uploadedAt) : new Date();
  const primaryLanguage = languages[0]?.name || "Unknown";

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
    technologies: [],
    frameworks: [],
    buildTools: [],
    tools: [],
    architecturePatterns: [],
    architecture: null,
    fileTree,
    fileContents: {},
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

export async function getRepositories() {
  const response = await apiRequest("/api/repositories");
  return Array.isArray(response) ? response.map(mapBackendRepository) : [];
}

export async function getRepository(id) {
  const response = await apiRequest(`/api/repositories/${id}`);
  return mapBackendRepository(response);
}

export async function addRepository(repo) {
  if (repo?.sourceFile instanceof File) {
    return uploadRepositoryZip(repo.sourceFile, repo.name);
  }
  throw new Error("Backend repository creation currently requires a ZIP file upload.");
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
