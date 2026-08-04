export const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Go: "#00add8",
  Rust: "#dea584",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Shell: "#89e051",
  PowerShell: "#012456",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Scala: "#c22d40",
  "Objective-C": "#438eff",
  R: "#198ce7",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  GraphQL: "#e10098",
  SQL: "#e38c00",
  JSON: "#292929",
  YAML: "#cb171e",
  Markdown: "#083fa1",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  Lua: "#000080",
  Haskell: "#5e5086",
  Clojure: "#db5855",
  Elixir: "#6e4a7e",
  Julia: "#a270ba",
  Perl: "#0298c3",
  TypeScriptReact: "#3178c6",
  JavaScriptReact: "#f1e05a"
};

export function getLanguageColor(language) {
  if (!language) return "#cccccc";
  const normalized = language.trim();
  // Case-insensitive lookup or exact match
  if (LANGUAGE_COLORS[normalized]) {
    return LANGUAGE_COLORS[normalized];
  }
  // Try case-insensitive
  const lower = normalized.toLowerCase();
  const found = Object.keys(LANGUAGE_COLORS).find(
    (key) => key.toLowerCase() === lower
  );
  return found ? LANGUAGE_COLORS[found] : "#cccccc";
}
