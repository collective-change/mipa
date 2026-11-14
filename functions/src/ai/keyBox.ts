// Encrypts organizations' AI provider keys at rest (AES-256-GCM). The
// encryption key lives in Secret Manager as AI_KEY_ENCRYPTION_KEY: 32 random
// bytes, base64. Create it with
//   openssl rand -base64 32 | firebase functions:secrets:set AI_KEY_ENCRYPTION_KEY
// For the emulators, put AI_KEY_ENCRYPTION_KEY=<value> in functions/.secret.local.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { defineSecret } from "firebase-functions/params";

export const aiKeyEncryptionKey = defineSecret("AI_KEY_ENCRYPTION_KEY");

function key(secret: string): Buffer {
  const bytes = Buffer.from(secret, "base64");
  if (bytes.length != 32) throw new Error("AI_KEY_ENCRYPTION_KEY must be 32 bytes, base64.");
  return bytes;
}

export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function open(sealed: string, secret: string): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version != "v1") throw new Error("Unknown key format.");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
