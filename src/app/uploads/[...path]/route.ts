import { NextResponse, type NextRequest } from "next/server";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import { getUploadDir } from "@/lib/upload";

/**
 * GET /uploads/[...path] — 上传图片静态服务(ARCHITECTURE §5.1)。
 * 从 UPLOAD_DIR 读取文件并返回,带缓存头。
 * 仅允许 .webp 扩展名,防止任意文件读取。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const filename = path.join("/");

  // 安全:只允许 .webp 后缀,防止路径遍历
  if (!filename.endsWith(".webp") || filename.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = join(getUploadDir(), filename);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
