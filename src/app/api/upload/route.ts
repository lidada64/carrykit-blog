import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  MAX_FILE_SIZE,
  isValidImageType,
  processAndSaveImage,
} from "@/lib/upload";

/**
 * POST /api/upload — 图片上传接口(ARCHITECTURE §5.1)。
 * 要求 admin session 鉴权;接收 multipart/form-data 的 file 字段;
 * sharp 转 WebP 后写入 UPLOAD_DIR,返回 { url }。
 */
export async function POST(request: Request): Promise<NextResponse> {
  // 鉴权:仅 admin 可上传
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // MIME 类型校验
    if (!isValidImageType(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type, only images are allowed" },
        { status: 400 },
      );
    }

    // 文件大小校验
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large, maximum 5MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await processAndSaveImage(buffer);

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
