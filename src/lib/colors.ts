/** Stable accent colour per project, derived from its id (no extra column needed). */
const PROJECT_COLORS = ['#5b6cff', '#e5577b', '#f2a93b', '#17a673', '#2f8fdd', '#9a5cf0', '#e0663f', '#12a3a3'];
export function projectColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}
