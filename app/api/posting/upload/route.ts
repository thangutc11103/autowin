import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { Platform, Video } from "@/types/video";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "ready");
const PUBLIC_UPLOAD_PATH = "/uploads/ready";
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function getExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return extension || ".mp4";
}

function sanitizeTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Uploaded video";
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
  const metadata = typeof rawMetadata === "string" ? JSON.parse(rawMetadata) : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No video files uploaded" }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const uploadedVideos: Video[] = [];

  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: `${file.name} is not a video file` },
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
    const storedName = `${id}${getExtension(file.name)}`;
    const diskPath = path.join(UPLOAD_DIR, storedName);
    const publicUrl = `${PUBLIC_UPLOAD_PATH}/${storedName}`;

    await writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

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
        uploadFileName: file.name,
        uploadFileSize: file.size,
        uploadFileType: file.type,
      },
    });
  }

  return NextResponse.json({
    success: true,
    uploadedVideos,
  });
}
