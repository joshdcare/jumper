export function truncate(str: string, maxLen = 2048): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `...[truncated, ${str.length} bytes total]`;
}
