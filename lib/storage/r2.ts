import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Cloudflare R2 storage`);
  }
  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const R2_REQUIRED_IN_PRODUCTION_ERROR =
  "Cloudflare R2 is required in production. Check R2 env configuration.";

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID),
  );
}

export function isR2RequiredButMissing(): boolean {
  return process.env.NODE_ENV === "production" && !isR2Configured();
}

export function getR2Client(): S3Client {
  if (!client) {
    const endpoint =
      process.env.R2_ENDPOINT ||
      `https://${getRequiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: true,
    });
  }

  return client;
}

export function getR2PublicUrl(key: string): string {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${trimTrailingSlash(publicBaseUrl)}/${key}`;
  }

  const bucket = getRequiredEnv("R2_BUCKET");
  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${getRequiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

  return `${trimTrailingSlash(endpoint)}/${bucket}/${key}`;
}

export async function uploadR2Object(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<{ key: string; publicUrl: string }> {
  const bucket = getRequiredEnv("R2_BUCKET");

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
    }),
  );

  return {
    key: params.key,
    publicUrl: getR2PublicUrl(params.key),
  };
}
