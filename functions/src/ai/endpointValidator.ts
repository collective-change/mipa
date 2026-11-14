/**
 * Endpoint SSRF Validation for AI Providers
 *
 * Endpoints must use https and cannot target private IPs or cloud instance metadata.
 * In the local emulator only, a mock provider on this machine may use http.
 */
export function isAllowedEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (process.env.FUNCTIONS_EMULATOR === "true") {
      if (parsed.protocol === "http:" && (hostname === "127.0.0.1" || hostname === "localhost")) {
        return true;
      }
    }

    if (parsed.protocol !== "https:") return false;

    // Reject internal metadata, loopback, and link-local addresses
    if (
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return false;
    }

    // Reject private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
