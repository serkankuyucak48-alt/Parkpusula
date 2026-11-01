// Doluluk durumu hesabı: web uygulamasındaki ile aynı mantık.
// Canlı veri zamanla etkisini yitirir; taze veri yoksa saat örüntüsünden tahmin edilir.
import { fmtDist } from "./geo";

export const COLORS = { ok: "#1f9d55", mid: "#d99a00", full: "#d64545", none: "#8a948f" };
const LABELS = { ok: "Yer var", mid: "Az yer", full: "Dolu" };

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return m + " dk önce";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " sa önce";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function statusOf(s, at, specialDays) {
  const now = at || Date.now();
  let lw = 0, lv = 0, last = null, fbn = 0, adm = null;
  (s._occ || []).forEach((o) => {
    const t = new Date(o.observed_at), age = (now - t) / 60000;
    if (age > 360 || age < -5) return;
    const w = Math.pow(0.5, age / 90);
    lw += w; lv += w * o.occupancy_percent;
    if (!adm) adm = o;
    if (!last || t > last) last = t;
  });
  (s._fb || []).forEach((f) => {
    const t = new Date(f.created_at), age = (now - t) / 60000;
    if (age > 180 || age < -5) return;
    const w = 0.6 * (f.trust != null ? +f.trust / 0.6 : 1) * Math.pow(0.5, age / 25);
    lw += w; lv += w * (f.availability === "full" ? 95 : 25);
    fbn++;
    if (!last || t > last) last = t;
  });
  const e = s._est || {};
  let prior = null, pw = 0, ptxt = "";
  if (e.slot_n >= 2) {
    prior = +e.slot_avg; pw = 0.3 + Math.min(0.7, e.slot_n / 10);
    ptxt = "genelde bu saatte %" + Math.round(prior) + " (" + e.slot_n + " gözlem)";
  } else if (e.all_n >= 1) {
    prior = +e.all_avg; pw = 0.25;
    const lo = (s._occ || [])[0];
    ptxt = lo ? "son gözlem %" + lo.occupancy_percent + ", " + ago(lo.observed_at) : "geçmiş ortalama %" + Math.round(prior);
  }
  const dayKey = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const sd = specialDays && specialDays[dayKey];
  if (sd && prior != null) { prior = Math.max(0, Math.min(100, prior + sd.shift)); ptxt = (ptxt ? ptxt + " · " : "") + sd.label + " etkisi"; }
  if (lw < 0.03 && prior == null) {
    return { key: "none", kind: "none", kindLabel: "", label: "Veri yetersiz", color: COLORS.none, score: null, detail: "Bu sokak için henüz gözlem yok" };
  }
  const score = Math.round((lv + (prior != null ? prior * pw : 0)) / (lw + (prior != null ? pw : 0)));
  const key = score < 60 ? "ok" : score < 85 ? "mid" : "full";
  const kind = lw >= 0.4 ? "live" : "est";
  const parts = [];
  if (lw >= 0.03) {
    if (adm) parts.push("yönetici %" + adm.occupancy_percent);
    if (fbn) parts.push(fbn + " sürücü bildirimi");
    parts.push(ago(last));
  }
  if (kind === "est" && ptxt) parts.unshift(ptxt);
  return { key, kind, kindLabel: kind === "live" ? "Canlı" : "Tahmin", score, label: LABELS[key], color: COLORS[key], detail: parts.join(" · ") };
}

export function hasData(s) {
  return (s._occ || []).length || (s._fb || []).length || s._est;
}

export function ruleText(s) {
  if (s.parking_status === "prohibited") return "Park yasak · ceza ve çekici riski" + (s.rule_note ? " · " + s.rule_note : "");
  if (s.parking_status === "restricted") return "Kısıtlı park" + (s.rule_note ? ": " + s.rule_note : "");
  return "";
}

export function capacityText(s, st) {
  if (!s.capacity_est || st.score == null) return "";
  return "yaklaşık " + Math.max(0, Math.round((s.capacity_est * (100 - st.score)) / 100)) + " boş yer / " + s.capacity_est + " araçlık";
}

export { fmtDist };
