"use client";

import { useCallback, useRef, useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useT } from "@/i18n";

/**
 * Markdown 编辑器(US-M4):textarea + 编辑/预览切换 + 图片插入。
 * 预览直接复用前台的 MarkdownContent(同一 lib/markdown.ts 管线),
 * 保证预览效果与详情页一致。预览时 textarea 仅隐藏,值照常随表单提交。
 *
 * M5-3:工具栏「插入图片」按钮,上传后在光标位置插入 ![](url)。
 */
export function MarkdownEditor({
  name,
  defaultValue,
  rows,
  className,
}: {
  name: string;
  defaultValue?: string;
  rows: number;
  className: string;
}) {
  const t = useT();
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImageAtCursor = useCallback(
    (url: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        setValue((prev) => `${prev}\n![image](${url})\n`);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = value;
      const imageMarkdown = `![image](${url})`;
      const newValue =
        text.substring(0, start) + imageMarkdown + text.substring(end);
      setValue(newValue);

      // 恢复光标位置到插入内容之后
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + imageMarkdown.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [value],
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      setImageError("");

      if (!file.type.startsWith("image/")) {
        setImageError(t("admin.uploadInvalidType"));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setImageError(t("admin.uploadTooLarge"));
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res
            .json()
            .catch(() => ({ error: "Upload failed" }));
          setImageError(data.error || "Upload failed");
          return;
        }

        const data: { url: string } = await res.json();
        insertImageAtCursor(data.url);
        setShowImagePanel(false);
      } catch {
        setImageError(t("admin.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [t, insertImageAtCursor],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
    },
    [handleImageUpload],
  );

  const [imageUrlInput, setImageUrlInput] = useState("");

  const handleInsertUrl = useCallback(() => {
    if (imageUrlInput.trim()) {
      insertImageAtCursor(imageUrlInput.trim());
      setImageUrlInput("");
      setShowImagePanel(false);
    }
  }, [imageUrlInput, insertImageAtCursor]);

  const tabClass = (active: boolean) =>
    `cursor-pointer border px-3 py-1 text-caption font-mono uppercase ${
      active
        ? "border-foreground text-foreground"
        : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={tabClass(!preview)}
        >
          {t("admin.editTab")}
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={tabClass(preview)}
        >
          {t("admin.previewTab")}
        </button>
        {/* 插入图片按钮:仅编辑模式显示 */}
        {!preview && (
          <button
            type="button"
            onClick={() => setShowImagePanel((prev) => !prev)}
            className={`${tabClass(showImagePanel)} ml-auto`}
            title={t("admin.insertImage")}
          >
            📷 {t("admin.insertImage")}
          </button>
        )}
      </div>

      {/* 图片插入面板 */}
      {showImagePanel && !preview && (
        <div className="flex flex-col gap-2 border border-border p-3">
          {/* 上传方式 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer border border-foreground px-3 py-1 text-caption font-mono uppercase disabled:opacity-50"
            >
              {uploading ? t("admin.uploading") : t("admin.uploadTab")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <span className="text-caption text-muted">or</span>
          </div>
          {/* URL 方式 */}
          <div className="flex gap-2">
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInsertUrl();
                }
              }}
              placeholder="https://..."
              className="flex-1 border border-border bg-background px-3 py-1 text-body text-foreground"
            />
            <button
              type="button"
              onClick={handleInsertUrl}
              className="cursor-pointer border border-foreground px-3 py-1 text-caption font-mono uppercase"
            >
              {t("admin.insertImage")}
            </button>
          </div>
          {imageError && (
            <p className="text-caption text-accent">{imageError}</p>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        name={name}
        rows={rows}
        // required 仅在可见时生效:隐藏的必填控件会阻断浏览器校验
        required={!preview}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={preview ? "hidden" : className}
      />
      {preview && (
        <div className="border border-border p-4">
          <MarkdownContent content={value} />
        </div>
      )}
    </div>
  );
}
