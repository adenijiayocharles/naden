export function shiftLightness(hex: string, delta: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const nl = Math.min(0.95, Math.max(0.05, l + delta / 100));
  const q = nl < 0.5 ? nl * (1 + s) : nl + s - nl * s;
  const p = 2 * nl - q;
  const hk = h;
  const toC = (t: number) => {
    const tc = ((t % 1) + 1) % 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  const nr = s === 0 ? nl : toC(hk + 1 / 3);
  const ng = s === 0 ? nl : toC(hk);
  const nb = s === 0 ? nl : toC(hk - 1 / 3);
  return `#${[nr, ng, nb].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}
