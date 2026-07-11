import { randomBytes } from "crypto";
import { join } from "path";
import sharp from "sharp";
import { mkdir } from "fs/promises";

/** 上传图片最大尺寸(字节):5MB */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** 允许的 MIME 类型前缀 */
const ALLOWED_MIME_PREFIX = "image/";

/** WebP 转换最大宽度 */
const MAX_WIDTH = 1920;

/** WebP 质量 */
const WEBP_QUALITY = 80;

/** 获取上传目录路径(ARCHITECTURE §5.1) */
export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || "./uploads";
}

/** 生成唯一文件名:{timestamp}-{random}.webp */
function generateFilename(): string {
  const timestamp = Date.now();
  const random = randomBytes(8).toString("hex");
  return `${timestamp}-${random}.webp`;
}

/** 校验上传文件的 MIME 类型 */
export function isValidImageType(mimeType: string): boolean {
  return mimeType.startsWith(ALLOWED_MIME_PREFIX);
}

/**
 * 处理上传图片:sharp 转 WebP + 限宽 + 压缩,写入 UPLOAD_DIR。
 * 返回可公开访问的 URL 路径(如 /uploads/xxx.webp)。
 */
export async function processAndSaveImage(buffer: Buffer): Promise<string> {
  const filename = generateFilename();
  const uploadDir = getUploadDir();

  // 确保上传目录存在
  await mkdir(uploadDir, { recursive: true });

  const outputPath = join(uploadDir, filename);

  // sharp 转 WebP:限制最大宽度,保持比例
  await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  return `/uploads/${filename}`;
}
