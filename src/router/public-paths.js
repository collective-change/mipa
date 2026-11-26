// Pages that can be viewed without signing in.
export const PUBLIC_PATHS = [
  "/",
  "/about",
  "/landing",
  "/auth",
  "/privacy",
  "/instrumentation",
  "/terms",
  "/settings/help",
  "/help",
  "/coverage"
];

/**
 * Checks whether a given path is accessible without authentication.
 * Supports static routes, dynamic public dossier routes (/m/:modelId),
 * and public register records (/records/:recordId, /coverage).
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isPublicPath(path) {
  if (!path || typeof path !== "string") return false;
  if (PUBLIC_PATHS.includes(path)) return true;
  if (path.startsWith("/m/")) return true;
  if (path.startsWith("/records/")) return true;
  return false;
}
