import { retrieveRelevantFiles, formatRetrievedFiles } from "./codeRetriever.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Retry configuration ────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000; // doubles each attempt: 1s, 2s, 4s
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

// ─── Typed error ─────────────────────────────────────────────────────────────
/**
 * Structured error thrown by Gemini service functions.
 */
export class GeminiApiError extends Error {
  /**
   * @param {string} message  Human-readable description.
   * @param {number} status   HTTP status code (0 = network failure / no response).
   * @param {boolean} retryable Whether callers should back-off and retry.
   */
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Fetches the Gemini API key from the environment.
 * @throws {GeminiApiError} if the key is absent or is the placeholder.
 */
function getApiKey() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    throw new GeminiApiError(
      "Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.",
      401,
      false
    );
  }
  return apiKey;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
/**
 * Sends a single (non-retried) request to the Gemini REST API.
 * @param {Array}  contents             Gemini `contents` array.
 * @param {string} systemInstructionText Optional system instruction.
 * @param {boolean} isJson              Request JSON output MIME type.
 * @returns {Promise<string>}           Raw text from the first candidate.
 * @throws {GeminiApiError}
 */
async function callGemini(contents, systemInstructionText, isJson = false) {
  const apiKey = getApiKey();

  const body = {
    contents,
    generationConfig: isJson ? { responseMimeType: "application/json" } : undefined,
  };

  if (systemInstructionText) {
    body.systemInstruction = {
      parts: [{ text: systemInstructionText }],
    };
  }

  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    // Fetch itself threw (e.g. no internet, DNS failure)
    throw new GeminiApiError(
      "Network error — could not reach the Gemini API. Check your internet connection.",
      0,
      true // network failures are worth retrying
    );
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorBody = await response.json();
      errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
    } catch (_) {
      // ignore JSON parse failure
    }
    throw new GeminiApiError(
      `Gemini API Error (${response.status}): ${errorDetail}`,
      response.status,
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const blockReason = data.candidates?.[0]?.finishReason;
    throw new GeminiApiError(
      blockReason
        ? `Gemini returned no content (reason: ${blockReason}).`
        : "No response content from Gemini API.",
      200,
      false
    );
  }

  return text;
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────
/**
 * Calls `callGemini` with exponential back-off for retryable errors (429 / 503).
 *
 * @param {Array}    contents             Gemini `contents` array.
 * @param {string}   systemInstructionText Optional system instruction.
 * @param {boolean}  isJson               Request JSON MIME type.
 * @param {Function} [onRetry]            Called before each retry attempt:
 *                                        `onRetry(attempt, totalAttempts, delayMs)`.
 * @returns {Promise<string>}
 * @throws {GeminiApiError}  Re-throws the last error after exhausting retries.
 */
async function callGeminiWithRetry(
  contents,
  systemInstructionText,
  isJson = false,
  onRetry = null
) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(contents, systemInstructionText, isJson);
    } catch (err) {
      lastError = err;

      const isRetryable = err instanceof GeminiApiError ? err.retryable : false;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);

      if (typeof onRetry === "function") {
        onRetry(attempt, MAX_RETRIES, delayMs);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but safety net
  throw lastError;
}

// ─── Fallback response builder ────────────────────────────────────────────────
/**
 * Constructs a structured AI-style response entirely from local repo data.
 * Used when all Gemini attempts fail so the user still gets a useful answer.
 *
 * @param {string} userPrompt   The user's original question.
 * @param {object} repoContext  The stored repository analysis object.
 * @returns {string}            JSON string matching the `askWithContext` schema.
 */
export function buildFallbackResponse(userPrompt, repoContext) {
  const name =
    repoContext.name ||
    (repoContext.metadata && repoContext.metadata.name) ||
    "this repository";

  const langs = Array.isArray(repoContext.languages)
    ? repoContext.languages.map((l) => l.name).filter(Boolean)
    : [];
  const techs = Array.isArray(repoContext.technologies)
    ? repoContext.technologies.slice(0, 8)
    : [];
  const frameworks = Array.isArray(repoContext.frameworks)
    ? repoContext.frameworks.slice(0, 6)
    : [];
  const patterns = Array.isArray(repoContext.architecturePatterns)
    ? repoContext.architecturePatterns
    : [];
  const fileCount =
    repoContext.files || (repoContext.fileTree && repoContext.fileTree.length) || 0;

  // Build a useful offline summary
  const langLine =
    langs.length > 0
      ? `The primary languages are **${langs.slice(0, 3).join(", ")}**.`
      : "No language data was recorded.";

  const techLine =
    techs.length > 0
      ? `Detected technologies include: ${techs.join(", ")}.`
      : "";

  const fwLine =
    frameworks.length > 0
      ? `Frameworks in use: **${frameworks.join(", ")}**.`
      : "";

  const patternLine =
    patterns.length > 0
      ? `Architecture patterns detected: ${patterns.join(", ")}.`
      : "";

  const explanation = [
    `⚠️ **Gemini AI is currently unavailable.** The following summary is generated from the locally stored analysis of **${name}**.`,
    "",
    `The repository contains **${fileCount.toLocaleString()} files**. ${langLine}`,
    techLine,
    fwLine,
    patternLine,
    "",
    `**Your question:** *${userPrompt}*`,
    "",
    "I was unable to answer this with live AI assistance. Please retry when Gemini becomes available, or check your API key configuration.",
    "",
    "**What you can do:**",
    "- Click **Retry** to attempt the request again.",
    "- Open the **Code Explorer** to browse files directly.",
    "- Visit the **Architecture** page for a visual map.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return JSON.stringify({
    explanation,
    type: "general",
    complexity: null,
    edgeCases: null,
    confidenceScore: null,
    testCases: null,
    isFallback: true,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates an initial repository summary and AI insights.
 * @param {object} repo - The repository analysis data.
 * @returns {Promise<object>} Parsed summary object.
 */
export async function generateRepoSummary(repo) {
  const { metadata, languages, technologies, frameworks, architecturePatterns, fileCount, fileTree } = repo;

  const filePaths = fileTree ? fileTree.map((f) => f.path).slice(0, 150) : [];
  const fileListText =
    filePaths.join("\n") +
    (fileTree && fileTree.length > 150 ? `\n...and ${fileTree.length - 150} more files` : "");

  const prompt = `
Analyze the following repository and generate architectural insights, a summary, and recommendations.

Repository Name: ${metadata.name}
Description: ${metadata.description}
Total Files: ${fileCount || (fileTree ? fileTree.length : 0)}
Detected Languages: ${JSON.stringify(languages)}
Detected Technologies: ${JSON.stringify(technologies)}
Detected Frameworks: ${JSON.stringify(frameworks)}
Inferred Architecture: ${JSON.stringify(architecturePatterns)}

File Structure (Sample):
${fileListText}
`;

  const systemInstruction = `
You are an expert Senior Software Architect. Your job is to analyze the provided repository metadata and output a detailed architectural report.
You must respond in JSON format matching this schema:
{
  "repositorySummary": "A concise 1-2 sentence description of the project and its core purpose.",
  "architectureOverview": "A brief markdown section summarizing the repository's design patterns, directory organization, and framework integrations.",
  "insights": [
    {
      "title": "A short, punchy title for an insight (e.g. 'Good Test Coverage' or 'Missing Docker Configuration')",
      "description": "A detailed description explaining the insight, why it's important, and any findings.",
      "status": "success" | "warning" | "error"
    }
  ],
  "suggestions": [
    "A specific, actionable list item of code improvements, refactoring, or additions."
  ]
}
Return only the raw JSON. Do not wrap it in markdown code blocks.
`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const responseText = await callGeminiWithRetry(contents, systemInstruction, true);
  try {
    let cleanText = responseText.trim();
    if (cleanText.startsWith("```json") && cleanText.endsWith("```")) {
      cleanText = cleanText.slice(7, -3).trim();
    } else if (cleanText.startsWith("```") && cleanText.endsWith("```")) {
      cleanText = cleanText.slice(3, -3).trim();
    }
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Failed to parse Gemini summary JSON:", responseText);
    throw new GeminiApiError(
      "Could not parse AI response as JSON: " + error.message,
      200,
      false
    );
  }
}

/**
 * Ask a question about the repository with full context.
 *
 * @param {Array}    messages    Prior chat messages.
 * @param {string}   newPrompt   The user's new question.
 * @param {object}   repoContext The stored repository analysis object.
 * @param {Function} [onRetry]   Called before each retry: `onRetry(attempt, total, delayMs)`.
 * @returns {Promise<string>}    Raw JSON string response.
 */
export async function askWithContext(messages, newPrompt, repoContext, onRetry = null) {
  const { languages, technologies, frameworks, architecturePatterns, fileTree, fileContents } =
    repoContext;

  const name =
    repoContext.name ||
    (repoContext.metadata && repoContext.metadata.name) ||
    "Unnamed Repository";
  const description =
    repoContext.description ||
    (repoContext.metadata && repoContext.metadata.description) ||
    "No description provided.";

  // ── File tree listing (capped to avoid bloating the prompt) ──────────────
  const filePaths = fileTree ? fileTree.map((f) => f.path).slice(0, 300) : [];
  const fileListText =
    filePaths.join("\n") +
    (fileTree && fileTree.length > 300 ? `\n...and ${fileTree.length - 300} more files` : "");

  // ── Relevance-based file retrieval ────────────────────────────────────────
  // Score every stored file against the current user query and return the
  // top-N most relevant ones with per-file character budgets.
  // This replaces the old "dump every file at 1000 chars each" approach.
  const retrievedFiles = fileContents
    ? retrieveRelevantFiles(fileContents, newPrompt, {
        maxFiles:      8,
        maxTotalChars: 40000,
        topFileChars:  6000,
        restFileChars: 3000,
        readmeChars:   2000,
        configChars:    800,
        minScore:          5,
      })
    : [];

  const indexedFileCount = fileContents ? Object.keys(fileContents).length : 0;

  // ── DEBUG: confirm what was actually retrieved ──────────────────────────
  console.log(
    `[GeminiService] fileContents keys: ${indexedFileCount}`,
    fileContents ? Object.keys(fileContents).slice(0, 20) : "(none)"
  );
  console.log(
    `[GeminiService] retrievedFiles (${retrievedFiles.length}):`,
    retrievedFiles.map((f) => ({ path: f.path, tier: f.tier, score: f.score }))
  );

  const codeContextBlock = formatRetrievedFiles(retrievedFiles);
  const hasRealSourceCode = retrievedFiles.some(
    (f) => f.tier === "source" || f.tier === "markup"
  );
  console.log(`[GeminiService] codeContextBlock length: ${codeContextBlock.length} chars | hasRealSourceCode: ${hasRealSourceCode}`);
  console.log("[GeminiService] codeContextBlock preview:", codeContextBlock.slice(0, 300));

  const systemInstruction = `
You are an expert Senior Software Engineer Assistant embedded in an AI Codebase Archaeologist tool.
You have been given ACTUAL SOURCE CODE extracted from the repository — not just file names.

Repository: ${name}
Description: ${description}
Languages: ${JSON.stringify(languages)}
Technologies: ${JSON.stringify(technologies)}
Frameworks: ${JSON.stringify(frameworks)}
Architecture Patterns: ${JSON.stringify(architecturePatterns)}
Total Indexed Files: ${indexedFileCount}

Full File Tree (${filePaths.length} paths shown):
${fileListText}

---
RELEVANT SOURCE FILES (${retrievedFiles.length} file${retrievedFiles.length !== 1 ? "s" : ""} selected by relevance to the current question):
${codeContextBlock}
---

CRITICAL INSTRUCTIONS:
- You have access to real source code in the files above. Use it to give precise, grounded answers.
- ${hasRealSourceCode ? "Quote specific function names, variables, and code snippets from the actual source when answering. Reference the exact file path." : "Use the configuration files and file tree to form your answer."}
- NEVER say "I only have access to file names" or "I don't have the source code" — you do have it above.
- If the user asks about a file that was not retrieved, say: "The file <name> exists in the repository (visible in the file tree) but was not retrieved for this query — ask about it directly and I can focus on it."
- Cite file paths explicitly when referring to code (e.g. "In src/services/authService.js, the login function...").
- If retrieved files are insufficient to fully answer, say so clearly and explain what additional files would help.

You must always respond in JSON format conforming to the following schema:
{
  "explanation": "Your main response using standard Markdown. Include real code quotes from the files above.",
  "type": "code_review" | "debugging" | "optimization" | "general",
  "complexity": {
    "time": "Time complexity (e.g. O(N), O(log N), O(1))",
    "space": "Space complexity",
    "explanation": "Brief reasoning"
  } | null,
  "edgeCases": ["Edge case 1", ...] | null,
  "confidenceScore": 0-100,
  "testCases": [
    { "input": "Input scenario", "expectedOutput": "Expected result", "description": "Validation details" }
  ] | null
}

For general/greeting messages: type="general", confidenceScore=100, complexity/edgeCases/testCases=null.
For code/debug/optimization questions: populate all fields. Base your answer on the actual code retrieved.
Return only raw JSON. Do not wrap it in markdown code blocks.
`;

  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  contents.push({ role: "user", parts: [{ text: newPrompt }] });

  return callGeminiWithRetry(contents, systemInstruction, true, onRetry);
}

/**
 * Explains a specific file dynamically based on its content using Gemini.
 *
 * @param {string} filename  The name/path of the file.
 * @param {string} content   The code content of the file.
 * @param {string} language  The programming language.
 * @returns {Promise<object>} Parsed explanation object.
 */
export async function explainFile(filename, content, language) {
  const prompt = `
Analyze and explain the following codebase file:
File Name: ${filename}
Language: ${language}

Source Code:
\`\`\`${language ? language.toLowerCase() : "code"}
${content.substring(0, 12000)}
\`\`\`
`;

  const systemInstruction = `
You are an expert Senior Software Engineer. Your job is to analyze the source code of the provided file and generate a detailed report.
You must respond in JSON format matching this schema:
{
  "overview": "A concise paragraph (2-3 sentences) detailing the file's primary purpose and role in the application architecture.",
  "dependencies": [
    "LibraryName or Imported Module (reason or usage)"
  ],
  "functions": [
    {
      "name": "functionSignature() or ClassName",
      "description": "A brief explanation of what it does and its parameters."
    }
  ],
  "usedBy": [
    "Typical layers or caller modules that utilize this file"
  ]
}
Return only the raw JSON. Do not wrap it in markdown code blocks.
`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const responseText = await callGeminiWithRetry(contents, systemInstruction, true);
  try {
    let cleanText = responseText.trim();
    if (cleanText.startsWith("```json") && cleanText.endsWith("```")) {
      cleanText = cleanText.slice(7, -3).trim();
    } else if (cleanText.startsWith("```") && cleanText.endsWith("```")) {
      cleanText = cleanText.slice(3, -3).trim();
    }
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Failed to parse Gemini file explanation JSON:", responseText);
    throw new GeminiApiError(
      "Could not parse AI response as JSON: " + error.message,
      200,
      false
    );
  }
}
