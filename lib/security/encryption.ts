import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY || process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const key = getEncryptionKey();
  if (!key) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!value.startsWith(PREFIX)) {
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required to decrypt stored OAuth tokens");
  }

  const payload = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
