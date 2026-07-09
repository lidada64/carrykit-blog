"use client";

import { useState } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useT } from "@/i18n";

/**
 * Markdown 编辑器(US-M4):textarea + 编辑/预览切换。
 * 预览直接复用前台的 MarkdownContent(同一 lib/markdown.ts 管线),
 * 保证预览效果与详情页一致。预览时 textarea 仅隐藏,值照常随表单提交。
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
      </div>
      <textarea
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
