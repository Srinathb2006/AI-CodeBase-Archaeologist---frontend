import { apiRequest } from "./apiClient";

function asBody(options = {}) {
  return JSON.stringify({
    forceRefresh: Boolean(options.forceRefresh),
    instructions: options.instructions || "",
  });
}

export async function analyzeRepositoryWithBackend(repositoryId, options = {}) {
  return apiRequest(`/api/ai/repositories/${repositoryId}/analyze`, {
    method: "POST",
    body: asBody(options),
  });
}

export async function explainArchitectureWithBackend(repositoryId, options = {}) {
  return apiRequest(`/api/ai/repositories/${repositoryId}/architecture`, {
    method: "POST",
    body: asBody(options),
  });
}

export async function generateDocumentationWithBackend(repositoryId, options = {}) {
  return apiRequest(`/api/ai/repositories/${repositoryId}/documentation`, {
    method: "POST",
    body: asBody(options),
  });
}

export async function askRepositoryQuestion(repositoryId, question) {
  return apiRequest(`/api/ai/repositories/${repositoryId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
