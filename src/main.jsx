import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./app/App";
import "./styles/index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const root = createRoot(document.getElementById("root"));

if (!googleClientId) {
  // Avoid throwing at runtime when the env var isn't provided.
  // The Google OAuth widget requires a client_id; show app without provider.
  // Developers should set VITE_GOOGLE_CLIENT_ID in .env or .env.local.
  // Log a clear warning to make the issue easy to spot during development.
  // eslint-disable-next-line no-console
  console.warn("VITE_GOOGLE_CLIENT_ID is not set — Google OAuth disabled.");
  root.render(<App />);
} else {
  // Debug: confirm client id is present and masked for logs
  // eslint-disable-next-line no-console
  console.debug("VITE_GOOGLE_CLIENT_ID present, length=", googleClientId ? googleClientId.length : 0, "masked=", googleClientId ? googleClientId.slice(0, 6) + "..." + googleClientId.slice(-6) : null);
  root.render(
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  );
}
