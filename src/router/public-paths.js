// Pages that can be viewed without signing in.
export const PUBLIC_PATHS = [
  "/",
  "/about",
  "/landing",
  "/auth",
  "/privacy",
  "/settings/help",
  "/help"
];

/**
 * Checks whether a given path is accessible without authentication.
 * Supports static routes and dynamic public dossier routes (/m/:modelId).
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isPublicPath(path) {
  if (!path || typeof path !== "string") return false;
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith("/m/")) return true;
  return false;
}
