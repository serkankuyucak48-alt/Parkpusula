// Otomatik park / ayrılma algılama.
// Telefon arka planda konumu düşük sıklıkta izler (yaklaşık her 25 m'de bir).
//  - Sürüş (≥ 20 km/s) → durma → aracın yanından yürüyerek uzaklaşma  ⇒ "park" (araç yeri de kaydedilir)
//  - Park edilmiş aracın yanından tekrar sürüşe geçme                  ⇒ "leave" (o sokakta yer açıldı)
// Sunucuya konum gönderilmez; sunucu noktayı en yakın sokak kesimine eşler ve yalnızca kesim + zaman saklar.
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId, sb } from "./api";
import { dist } from "./geo";

export const TASK = "pp-autopark";
const KEY = "pp_auto_state";
const DRIVE_MS = 5.5; // ~20 km/s
const SLOW_MS = 2.8; // yürüme ve altı
const WALK_AWAY_M = 35; // duruş noktasından bu kadar yürüyerek uzaklaşınca park sayılır
const STOP_WINDOW_MS = 20 * 60e3;
const CONFIRM_MS = 150e3; // uzaklaştıktan 2,5 dk sonra hâlâ sürüş yoksa park kesinleşir

async function readCar() {
  try { return JSON.parse((await AsyncStorage.getItem("pp_car")) || "null"); } catch (e) { return null; }
}

async function load() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "null") || { mode: "idle" }; } catch (e) { return { mode: "idle" }; }
}
const save = (s) => AsyncStorage.setItem(KEY, JSON.stringify(s));

async function report(p, kind) {
  try {
    const dev = await getDeviceId();
    await sb.rpc("pp_record_park_event", { p_lat: p[0], p_lng: p[1], p_kind: kind, p_device: dev });
  } catch (e) { /* çevrimdışı: atla */ }
}

// Konum örneklerinden durum makinesi. Saf fonksiyona yakın tutuldu: test edilebilir.
export async function handleLocations(locations) {
  let s = await load();
  const events = [];
  for (const l of locations) {
    const c = l.coords || {};
    if (c.accuracy != null && c.accuracy > 50) continue;
    const p = [c.latitude, c.longitude], t = l.timestamp || Date.now();
    let v = c.speed != null && c.speed >= 0 ? c.speed : null;
    if (v == null && s.prev && t > s.prev.t) v = dist(s.prev.p, p) / ((t - s.prev.t) / 1000);
    s.prev = { p, t };
    if (v == null) continue;

    // Yürüyerek uzaklaşıldı; trafikte yavaş ilerleme olmadığından emin olmak için kısa bir bekleme
    if (s.mode === "pending") {
      if (v >= DRIVE_MS) {
        if (t - s.pendAt >= CONFIRM_MS) events.push({ kind: "leave", p: s.car }); // park süresi belirsiz: yalnızca ayrılış
        else events.push({ kind: "cancel" });
        s = { mode: "driving", lastDrive: t, prev: s.prev };
      } else if (t - s.pendAt >= CONFIRM_MS) {
        events.push({ kind: "park", p: s.car });
        s = { mode: "parked", car: s.car, parkedAt: s.parkedAt, prev: s.prev };
      }
      continue;
    }
    if (s.mode === "parked") {
      if (Date.now() - s.parkedAt > 12 * 3600e3) s = { mode: "idle", prev: s.prev };
      else if (v >= DRIVE_MS && t - s.parkedAt > 3 * 60e3 && dist(p, s.car) < 250) {
        events.push({ kind: "leave", p: s.car });
        s = { mode: "driving", lastDrive: t, prev: s.prev };
      }
      continue;
    }
    if (v >= DRIVE_MS) { s.mode = "driving"; s.lastDrive = t; s.stop = null; continue; }
    if (s.mode !== "driving") continue;
    if (v <= SLOW_MS) {
      if (!s.stop) s.stop = { p, t, acc: c.accuracy || 30 };
      if (t - s.stop.t > STOP_WINDOW_MS) { s = { mode: "idle", prev: s.prev }; continue; }
      // Park manevrası ve araçtan iniş en az ~1 dk sürer; trafikte sürünmeyi bundan ayırır
      if (dist(p, s.stop.p) >= WALK_AWAY_M && t - s.stop.t >= 60e3 && s.stop.acc <= 35) {
        events.push({ kind: "car", p: s.stop.p });
        s = { mode: "pending", car: s.stop.p, parkedAt: s.stop.t, pendAt: t, prev: s.prev };
      }
    } else s.stop = null;
  }
  await save(s);
  for (const e of events) {
    if (e.kind === "car") {
      // Aracın yeri hemen kaydedilir ("Aracıma dön" için); elle kaydedilmiş yer varsa üzerine yazılmaz
      const cur = await readCar();
      if (!cur || cur.auto || Date.now() - cur.at > 3600e3) await AsyncStorage.setItem("pp_car", JSON.stringify({ p: e.p, street: "", at: Date.now(), auto: true }));
      continue;
    }
    if (e.kind === "park") { await report(e.p, "park"); continue; }
    // leave / cancel: otomatik kaydedilen araç yeri silinir
    if (e.kind === "leave") await report(e.p, "leave");
    const cur = await readCar();
    if (cur && cur.auto) await AsyncStorage.removeItem("pp_car");
  }
  return events;
}

// Görev kaydı uygulama açılışında (index.js) yapılmalı
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data || !data.locations) return;
  await handleLocations(data.locations);
});

export async function isAutoOn() {
  try { return await Location.hasStartedLocationUpdatesAsync(TASK); } catch (e) { return false; }
}

export async function startAuto() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") throw new Error("Konum izni verilmedi.");
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") throw new Error("Arka plan konum izni gerekiyor. Ayarlar › PARKPUSULA › Konum › \"Her Zaman\" seç.");
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 25,
    deferredUpdatesInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "PARKPUSULA",
      notificationBody: "Park ve ayrılma otomatik algılanıyor",
      notificationColor: "#2f7d6d",
    },
  });
  await AsyncStorage.setItem("pp_auto", "1");
}

export async function stopAuto() {
  try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); } catch (e) {}
  await AsyncStorage.multiRemove(["pp_auto", KEY]);
}
