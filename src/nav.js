// Uygulama içi navigasyon yardımcıları: rota (OSRM) ve Türkçe dönüş talimatları.
import { fmtDist } from "./geo";

const DIR = {
  left: "sola", right: "sağa", "slight left": "hafif sola", "slight right": "hafif sağa",
  "sharp left": "keskin sola", "sharp right": "keskin sağa", straight: "düz", uturn: "geri",
};
const ROT = { left: -90, right: 90, "slight left": -45, "slight right": 45, "sharp left": -135, "sharp right": 135, uturn: 180 };
const cap = (t) => (t ? t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1) : t);

export function instr(st) {
  const m = (st && st.maneuver) || {}, t = m.type, mod = m.modifier, nm = st && st.name ? " · " + st.name : "";
  const d = DIR[mod] || "";
  if (t === "arrive") return "Hedefe vardın";
  if (t === "depart") return st.name ? st.name + " boyunca ilerle" : "Yola çık";
  if (["roundabout", "rotary", "roundabout turn", "exit roundabout", "exit rotary"].includes(t))
    return "Göbekte " + (m.exit ? m.exit + ". çıkıştan " : "") + "çık" + nm;
  if (mod === "uturn") return "U dönüşü yap" + nm;
  if (t === "end of road") return "Yolun sonunda " + d + " dön" + nm;
  if (t === "fork") return "Çatalda " + d + " devam et" + nm;
  if (t === "merge") return "Yola katıl" + nm;
  if (t === "continue" || t === "new name" || mod === "straight")
    return (mod && mod !== "straight" ? cap(d) + " devam et" : "Düz devam et") + nm;
  return (d ? cap(d) + " dön" : "Devam et") + nm;
}

export const rotOf = (st) => {
  const m = (st && st.maneuver) || {};
  return m.type === "arrive" ? 0 : ROT[m.modifier] || 0;
};

export const sayDist = (m) => fmtDist(m).replace(" km", " kilometre").replace(" m", " metre");

export async function fetchRoute(from, to) {
  const u =
    "https://router.project-osrm.org/route/v1/driving/" +
    from[1] + "," + from[0] + ";" + to[1] + "," + to[0] +
    "?overview=full&geometries=geojson&steps=true";
  const r = await fetch(u);
  const j = await r.json();
  if (!j.routes || !j.routes[0]) throw new Error("Rota bulunamadı");
  const rt = j.routes[0];
  const steps = rt.legs[0].steps;
  const cum = [];
  let acc = 0;
  steps.forEach((s) => { cum.push(acc); acc += s.distance; });
  return {
    pts: rt.geometry.coordinates.map((c) => [c[1], c[0]]),
    steps, cum, len: rt.distance || acc, dur: rt.duration,
  };
}
