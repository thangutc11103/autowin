import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth/access-control";
import {
  isR2Configured,
  isR2RequiredButMissing,
  R2_REQUIRED_IN_PRODUCTION_ERROR,
  uploadR2Object,
} from "@/lib/storage/r2";
import type { Platform, Video } from "@/types/video";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "ready");
const PUBLIC_UPLOAD_PATH = "/uploads/ready";
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

function getExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return extension || ".mp4";
}

function sanitizeTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Uploaded video";
}

function getTenantId(formData: FormData): string {
  const tenantId = formData.get("tenantId");
  return typeof tenantId === "string" && tenantId.trim()
    ? tenantId.trim()
    : process.env.DEFAULT_TENANT_ID || "default";
}

function isPlatform(value: unknown): value is Platform {
  return (
    value === "tiktok" ||
    value === "youtube" ||
    value === "facebook" ||
    value === "instagram" ||
    value === "douyin"
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);
  const rawMetadata = formData.get("metadata");
  const tenantId = getTenantId(formData);
  const permissionError = await requireFeature({
    request,
    tenantId,
    featureKey: "upload_media",
  });
  if (permissionError) return permissionError;

  const useR2 = isR2Configured();
  if (isR2RequiredButMissing()) {
    return NextResponse.json(
      { error: R2_REQUIRED_IN_PRODUCTION_ERROR },
      { status: 500 },
    );
  }

  let metadata: unknown[] = [];

  if (typeof rawMetadata === "string" && rawMetadata.trim()) {
    try {
      const parsedMetadata = JSON.parse(rawMetadata);
      metadata = Array.isArray(parsedMetadata) ? parsedMetadata : [];
    } catch {
      return NextResponse.json(
        { error: "Upload metadata must be valid JSON" },
        { status: 400 },
      );
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No video files uploaded" }, { status: 400 });
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Upload at most ${MAX_FILES_PER_REQUEST} files at a time` },
      { status: 400 },
    );
  }

  if (!useR2) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const uploadedVideos: Video[] = [];

  for (const [index, file] of files.entries()) {
    const extension = getExtension(file.name);

    if (
      !ALLOWED_MIME_TYPES.has(file.type) ||
      !ALLOWED_EXTENSIONS.has(extension)
    ) {
      return NextResponse.json(
        { error: `${file.name} must be an mp4, mov, m4v, or webm video` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${file.name} is larger than 500 MB` },
        { status: 413 },
      );
    }

    const itemMetadata =
      Array.isArray(metadata) && typeof metadata[index] === "object"
        ? (metadata[index] as Record<string, unknown>)
        : {};
    const platform = isPlatform(itemMetadata.platform)
      ? itemMetadata.platform
      : "tiktok";
    const title =
      typeof itemMetadata.title === "string" && itemMetadata.title.trim()
        ? itemMetadata.title.trim()
        : sanitizeTitle(file.name);
    const id = `upload-${randomUUID()}`;
    const storedName = `${id}${extension}`;
    const objectKey = `tenants/${tenantId}/uploads/ready/${storedName}`;
    let diskPath: string | undefined;
    let publicUrl: string;
    let r2Key: string | undefined;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (useR2) {
      const uploaded = await uploadR2Object({
        key: objectKey,
        body: fileBuffer,
        contentType: file.type || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      });
      publicUrl = uploaded.publicUrl;
      r2Key = uploaded.key;
    } else {
      diskPath = path.join(UPLOAD_DIR, storedName);
      publicUrl = `${PUBLIC_UPLOAD_PATH}/${storedName}`;
      await writeFile(diskPath, fileBuffer);
    }

    uploadedVideos.push({
      id,
      title,
      thumbnail: "",
      platform,
      url: publicUrl,
      description: `Uploaded file - ${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      preparedLocalPath: diskPath,
      preparedLocalUrl: publicUrl,
      preparedAt: new Date().toISOString(),
      preparedSource: "direct-media",
      rawPayload: {
        tenantId,
        storageProvider: useR2 ? "cloudflare-r2" : "local",
        r2Key,
        publicUrl,
        uploadFileName: file.name,
        uploadFileSize: file.size,
        uploadFileType: file.type,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });
  }

  return NextResponse.json({
    success: true,
    uploadedVideos,
  });
}
