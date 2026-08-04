// LocalStorage backed Authentication Service with backend login/signup integration

const SESSION_KEY = "archaeologist_active_user";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
const NORMALIZED_API_BASE_URL = API_BASE_URL ? API_BASE_URL.replace(/\/$/, "") : "";

function generateUsername(fullName, email) {
  const base = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || email.split("@")[0];
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${base}-${suffix}`;
}

async function requestJson(path, init = {}) {
  const requestUrl = `${NORMALIZED_API_BASE_URL}${path}`;

  // Log request details for debugging (do not log sensitive tokens)
  // eslint-disable-next-line no-console
  console.debug("requestJson: ->", { url: requestUrl, init: { ...init, body: init.body ? "[REDACTED_BODY_LENGTH=" + init.body.length + "]" : undefined } });

  let response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      ...init,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("requestJson: network request failed", { url: requestUrl, error });
    throw new Error(`Unable to reach the authentication backend at ${requestUrl}. Make sure the Spring Boot service is running.`);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const errorMessage = (data && data.message) || data || response.statusText || "Request failed.";
    // eslint-disable-next-line no-console
    console.error("requestJson: response not OK", { status: response.status, errorMessage, raw: data });
    throw new Error(errorMessage);
  }

  return data;
}


/**
 * Registers a new user.
 */
export async function signup(email, password, fullName) {
  const normalizedEmail = email.toLowerCase().trim();
  const username = generateUsername(fullName, normalizedEmail);
  const response = await requestJson("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      username,
      email: normalizedEmail,
      fullName: fullName.trim(),
      password,
    }),
  });

  const user = {
    username: response.username,
    email: response.email,
    fullName: response.fullName || fullName.trim(),
    token: response.token,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

/**
 * Log in an existing user.
 */
export async function login(email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const response = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      usernameOrEmail: normalizedEmail,
      password,
    }),
  });

  const user = {
    username: response.username,
    email: response.email,
    fullName: response.fullName || response.username,
    token: response.token,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

/**
 * Perform Google OAuth login using a Google ID token and backend verification.
 */
export async function googleLogin(idToken) {
  // eslint-disable-next-line no-console
  console.debug("googleLogin: sending idToken length=", idToken ? idToken.length : 0);
  const response = await requestJson("/api/auth/oauth", {
    method: "POST",
    body: JSON.stringify({
      provider: "google",
      idToken,
    }),
  });
  // eslint-disable-next-line no-console
  console.debug("googleLogin: server response received", response);

  const user = {
    username: response.username,
    email: response.email,
    fullName: response.fullName || response.username,
    token: response.token,
    picture: response.picture || "",
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

/**
 * Log out current session.
 */
export async function logout() {
  try {
    await requestJson("/api/auth/logout", {
      method: "POST",
    });
  } catch (err) {
    // Best-effort logout even if backend request fails
    console.warn("Logout request failed", err);
  }

  localStorage.removeItem(SESSION_KEY);
  return true;
}

/**
 * Synchronously retrieves the current active user from session.
 */
export function getCurrentUser() {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Synchronous check if the session is currently authenticated.
 */
export function isLoggedIn() {
  const currentUser = getCurrentUser();
  return currentUser !== null && Boolean(currentUser.token);
}

export function getAuthHeaders() {
  const currentUser = getCurrentUser();
  return currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {};
}

/**
 * Updates the profile of the current active user.
 */
export async function updateProfile({ fullName, email, bio }) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("No active user session found.");

  const normalizedEmail = email.toLowerCase().trim();
  const response = await requestJson("/api/user/profile", {
    method: "PUT",
    headers: {
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      fullName: fullName.trim(),
      email: normalizedEmail,
      bio: bio || "",
    }),
  });

  const updatedUser = {
    ...currentUser,
    fullName: response.fullName || fullName.trim(),
    email: response.email || normalizedEmail,
    bio: response.bio || bio || "",
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
  return updatedUser;
}
