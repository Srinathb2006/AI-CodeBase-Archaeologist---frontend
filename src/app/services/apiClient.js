import { getAuthHeaders } from "./authService";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9098";

export async function apiRequest(path, init = {}) {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...getAuthHeaders(),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data?.message || data || response.statusText || "Request failed";
    throw new Error(message);
  }

  return data;
}
