// Koordinat yardımcıları. Noktalar [enlem, boylam] dizisi olarak tutulur.

export function dist(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const x =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function segPts(s) {
  return Array.isArray(s.path) && s.path.length > 1
    ? s.path
    : [[s.start_lat, s.start_lng], [s.end_lat, s.end_lng]];
}

export function segMid(s) {
  const p = segPts(s);
  return p[Math.floor(p.length / 2)];
}

// Noktanın bir çizgiye uzaklığı (m), çizgi üzerindeki konum oranı (0-1) ve çizgi uzunluğu (m)
export function lineInfo(p, pts) {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const P = pts.map((q) => [(q[1] - p[1]) * 111320 * k, (q[0] - p[0]) * 110540]);
  let best = 1e9, along = 0, acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    let t = L2 ? -(a[0] * dx + a[1] * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (d < best) { best = d; along = acc + t * L; }
    acc += L;
  }
  return { d: best, f: acc ? along / acc : 0, len: acc };
}

export function segDist(s, p) {
  return lineInfo(p, segPts(s)).d;
}

export function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

export function fmtDist(m) {
  return m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km";
}

export const toLL = (p) => ({ latitude: p[0], longitude: p[1] });
