// Supabase veri erişimi: web uygulamasıyla aynı tabloları ve fonksiyonları kullanır.
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
export const SB_URL = extra.supabaseUrl;
const SB_KEY = extra.supabaseAnonKey;

export const sb = createClient(SB_URL, SB_KEY, {
  auth: { storage: AsyncStorage, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function getDeviceId() {
  let id = await AsyncStorage.getItem("pp_dev");
  if (!id) {
    id = Crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    await AsyncStorage.setItem("pp_dev", id);
  }
  return id;
}

// Aktif sokak kesimleri + son 60 günün gözlemleri + son 24 saatin sürücü bildirimleri + saat örüntüsü tahminleri
export async function loadSegments(at) {
  const { data, error } = await sb.from("pp_street_segments").select("*").eq("is_active", true);
  if (error) throw error;
  if (!data.length) return data;
  const ids = data.map((s) => s.id);
  const since60 = new Date(Date.now() - 60 * 86400e3).toISOString();
  const since24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [o, f, est] = await Promise.all([
    sb.from("pp_admin_occupancy").select("id,segment_id,occupancy_percent,observed_at,source")
      .gte("observed_at", since60).order("observed_at", { ascending: false }).limit(5000),
    sb.rpc("pp_feedback_recent", { p_ids: ids, p_since: since24 }),
    sb.rpc("pp_segment_estimates", at ? { p_at: new Date(at).toISOString() } : {}),
  ]);
  if (o.error) throw o.error;
  if (f.error) throw f.error;
  const occ = o.data || [], fb = f.data || [], ed = (est && est.data) || [];
  for (const s of data) {
    s._occ = occ.filter((x) => x.segment_id === s.id);
    s._fb = fb.filter((x) => x.segment_id === s.id);
    s._est = ed.find((x) => x.segment_id === s.id);
  }
  return data;
}

export async function loadSpecialDays() {
  const { data } = await sb.from("pp_special_days").select("day,label,shift")
    .gte("day", new Date(Date.now() - 86400e3).toISOString().slice(0, 10));
  const map = {};
  (data || []).forEach((d) => { map[d.day] = d; });
  return map;
}

export async function sendFeedback(segmentId, availability) {
  const device_id = await getDeviceId();
  const { error } = await sb.from("pp_quick_feedback").insert({ segment_id: segmentId, availability, device_id });
  if (error) throw error;
}

// Adres arama (OpenStreetMap / Nominatim), Ankara öncelikli
export async function geocode(q) {
  const u =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=tr&countrycodes=tr&viewbox=32.55,40.10,33.10,39.75&bounded=0&q=" +
    encodeURIComponent(q);
  const r = await fetch(u, { headers: { "User-Agent": "PARKPUSULA/0.1 (tr.parkpusula.app)" } });
  const d = await r.json();
  return d.map((x) => ({
    name: x.name || x.display_name.split(",")[0],
    sub: x.display_name,
    p: [+x.lat, +x.lon],
  }));
}
