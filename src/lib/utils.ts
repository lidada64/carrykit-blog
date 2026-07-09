/** 通用小工具(ARCHITECTURE §2) */

/**
 * 内容日期展示格式 YYYY.MM.DD(PRD US-B1)。
 * 按 UTC 取值:入库日期为 UTC 零点,本地时区换算会偏移一天。
 */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", ".");
}
