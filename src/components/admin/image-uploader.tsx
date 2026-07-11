"use client";

import { useCallback, useRef, useState } from "react";
import { useT } from "@/i18n";

type Mode = "upload" | "url";

/**
 * 图片上传组件(M5-2):拖拽/点击上传 + 预览 + URL 手动输入双模式。
 * 上传成功后将 URL 写入隐藏 input,表单提交时自动随表单发送。
 *
 * admin 页面不受 DESIGN_SPEC 动效约束,保持朴素实用。
 */
export function ImageUploader({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const t = useT();

  // 判断默认值是上传路径还是外链 URL
  const isUploadUrl = defaultValue?.startsWith("/uploads/");
  const [mode, setMode] = useState<Mode>(
    defaultValue && !isUploadUrl ? "url" : "upload",
  );
  const [imageUrl, setImageUrl] = useState(defaultValue ?? "");
  const [urlInput, setUrlInput] = useState(
    defaultValue && !isUploadUrl ? defaultValue : "",
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setError("");
      setUploading(true);
      setProgress(0);

      // 客户端预校验
      if (!file.type.startsWith("image/")) {
        setError(t("admin.uploadInvalidType"));
        setUploading(false);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(t("admin.uploadTooLarge"));
        setUploading(false);
        return;
      }

      try {
        // 模拟进度(fetch 不支持真正的上传进度)
        setProgress(30);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        setProgress(90);

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed" }));
          setError(data.error || "Upload failed");
          setUploading(false);
          setProgress(0);
          return;
        }

        const data: { url: string } = await res.json();
        setProgress(100);
        setImageUrl(data.url);
      } catch {
        setError(t("admin.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [t],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) upload(file);
    },
    [upload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleClear = useCallback(() => {
    setImageUrl("");
    setUrlInput("");
    setError("");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrlInput(e.target.value);
      setImageUrl(e.target.value);
    },
    [],
  );

  const handleModeSwitch = useCallback(
    (newMode: Mode) => {
      setMode(newMode);
      setError("");
      // 切换模式时,如果 URL 模式有值,保留;否则清空
      if (newMode === "url") {
        // 从上传切到 URL,如果已有上传图片,保留它的 URL 以便显示
        if (imageUrl && !imageUrl.startsWith("/uploads/")) {
          setUrlInput(imageUrl);
        }
      }
    },
    [imageUrl],
  );

  // 当前有效的图片 URL(用于隐藏 input)
  const effectiveUrl = mode === "url" ? urlInput : imageUrl;

  const tabClass = (active: boolean) =>
    `cursor-pointer border px-3 py-1 text-caption font-mono uppercase ${
      active
        ? "border-foreground text-foreground"
        : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-2">
      {/* 隐藏 input:表单提交时提供值 */}
      <input type="hidden" name={name} value={effectiveUrl} />

      {/* 模式切换 tab */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleModeSwitch("upload")}
          className={tabClass(mode === "upload")}
        >
          {t("admin.uploadTab")}
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch("url")}
          className={tabClass(mode === "url")}
        >
          {t("admin.urlTab")}
        </button>
      </div>

      {mode === "upload" ? (
        <div className="flex flex-col gap-2">
          {/* 拖拽上传区 */}
          {!imageUrl && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileInputRef.current?.click();
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex min-h-32 cursor-pointer items-center justify-center border-2 border-dashed p-4 text-center text-caption text-muted transition-colors ${
                dragOver
                  ? "border-foreground bg-border/20"
                  : "border-border hover:border-muted"
              }`}
            >
              {uploading
                ? t("admin.uploading")
                : t("admin.uploadDropzone")}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 上传进度 */}
          {uploading && (
            <div className="h-1 w-full overflow-hidden bg-border">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        /* URL 手动输入模式 */
        <input
          type="url"
          value={urlInput}
          onChange={handleUrlChange}
          placeholder="https://..."
          className="border border-border bg-background px-3 py-2 font-body text-body normal-case tracking-normal text-foreground"
        />
      )}

      {/* 图片预览 */}
      {effectiveUrl && !uploading && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={effectiveUrl}
            alt="Cover preview"
            className="max-h-40 border border-border object-contain"
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center bg-foreground text-caption text-background"
            title={t("admin.uploadClear")}
          >
            ×
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="text-caption text-accent">{error}</p>
      )}
    </div>
  );
}
