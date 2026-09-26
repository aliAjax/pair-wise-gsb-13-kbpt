export function fmt(value: number, digits = 1): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}
