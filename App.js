// PARKPUSULA mobil uygulaması (telefon ekranı).
// Web uygulamasıyla aynı veritabanını ve aynı doluluk/tahmin mantığını kullanır.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, useColorScheme,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { geocode, loadSegments, loadSpecialDays, sendFeedback } from "./src/api";
import { bearing, dist, fmtDist, lineInfo, segDist, segMid, segPts, toLL } from "./src/geo";
import { capacityText, hasData, ruleText, statusOf } from "./src/status";
import { fetchRoute, instr, rotOf, sayDist } from "./src/nav";

const KIZILAY = [39.9208, 32.8541];
const RADIUS = 900;
const BRAND = "#2f7d6d";

const light = { bg: "#f5f7f6", panel: "#ffffff", ink: "#17231f", muted: "#5d6b66", line: "#dde5e2", brand: BRAND, brandInk: "#ffffff", soft: "#e3f1ed" };
const dark = { bg: "#0f1715", panel: "#18231f", ink: "#e7efec", muted: "#9db0a9", line: "#2a3833", brand: "#4fb39d", brandInk: "#0b1714", soft: "#16302a" };

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? dark : light;
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [segs, setSegs] = useState([]);
  const [specialDays, setSpecialDays] = useState({});
  const [focus, setFocus] = useState(null); // { p, name, isMe }
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState({});
  const [car, setCar] = useState(null);
  const [arrive, setArrive] = useState(null); // { s, mode: 'ask' | 'next', next }
  const [navUI, setNavUI] = useState(null);
  const [voice, setVoice] = useState(true);
  const [sheetMin, setSheetMin] = useState(false);

  const navRef = useRef(null);
  const watchRef = useRef(null);
  const tripRef = useRef({ dest: null, skip: [] });
  const toastTimer = useRef(null);

  const say = useCallback((msg, err) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, err });
    toastTimer.current = setTimeout(() => setToast(null), err ? 5000 : 2600);
  }, []);

  // ---- veri ----
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [data, days] = await Promise.all([loadSegments(), loadSpecialDays()]);
      setSegs(data);
      setSpecialDays(days);
    } catch (e) {
      say("Veri alınamadı: " + (e.message || e), true);
    } finally {
      setLoading(false);
    }
  }, [say]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    AsyncStorage.getItem("pp_car").then((v) => {
      try { const x = JSON.parse(v || "null"); if (x && Date.now() - x.at < 12 * 3600e3) setCar(x); } catch (e) {}
    });
    AsyncStorage.getItem("pp_voice").then((v) => setVoice(v !== "0"));
    return () => clearInterval(t);
  }, [refresh]);

  const nearby = useMemo(() => {
    if (!focus) return [];
    const rank = { ok: 0, mid: 1, none: 2, full: 3 };
    return segs
      .filter(hasData)
      .map((s) => ({ s, d: segDist(s, focus.p), st: statusOf(s, null, specialDays) }))
      .filter((x) => x.d <= RADIUS)
      .sort((a, b) => rank[a.st.key] - rank[b.st.key] || a.d - b.d);
  }, [segs, focus, specialDays]);

  const best = useCallback(
    (skip) => nearby.find((x) => x.st.key !== "full" && x.s.parking_status !== "prohibited" && !(skip || []).includes(x.s.id)),
    [nearby]
  );

  // ---- arama ve konum ----
  const goTo = useCallback((p, name, isMe) => {
    setFocus({ p, name, isMe });
    setResults(null);
    setOpenId(null);
    setSheetMin(false);
    mapRef.current && mapRef.current.animateCamera({ center: toLL(p), zoom: 16, altitude: 1400, heading: 0, pitch: 0 }, { duration: 600 });
  }, []);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const r = await geocode(q);
      if (!r.length) say("Sonuç bulunamadı.");
      setResults(r);
    } catch (e) {
      say("Arama yapılamadı. İnternet bağlantını kontrol et.", true);
    } finally {
      setSearching(false);
    }
  }, [query, say]);

  const myPosition = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      say("Konum izni verilmedi. Ayarlar'dan PARKPUSULA için konuma izin verebilirsin.", true);
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return [pos.coords.latitude, pos.coords.longitude];
  }, [say]);

  const locate = useCallback(async () => {
    const p = await myPosition();
    if (p) { setQuery(""); goTo(p, "Yakınındaki park yerleri", true); }
  }, [myPosition, goTo]);

  // ---- bildirim ----
  const vote = useCallback(async (s, v) => {
    try {
      await sendFeedback(s.id, v);
      setVoted((o) => ({ ...o, [s.id]: Date.now() }));
      say(v === "available" ? "Teşekkürler, “yer var” kaydedildi" : "Teşekkürler, “yer yok” kaydedildi");
      refresh();
    } catch (e) {
      say("Bildirim gönderilemedi: " + (e.message || e), true);
    }
  }, [refresh, say]);

  // ---- navigasyon ----
  const speak = useCallback((t) => {
    const n = navRef.current;
    if (!n || !n.voice) return;
    Speech.stop();
    Speech.speak(t, { language: "tr-TR" });
  }, []);

  const stopNav = useCallback(() => {
    if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
    navRef.current = null;
    setNavUI(null);
    Speech.stop();
    deactivateKeepAwake("nav");
  }, []);

  const routeFrom = useCallback(async (from) => {
    const n = navRef.current;
    if (!n) return;
    n.lastRoute = Date.now();
    try {
      const r = await fetchRoute(from, n.dest);
      if (navRef.current !== n) return;
      n.route = r; n.lastSpoken = -1; n.near = false; n.off = 0;
      if (n.hd == null && r.pts.length > 1) n.hd = bearing(r.pts[0], r.pts[1]);
      setNavUI((u) => ({ ...(u || {}), route: r.pts }));
    } catch (e) {
      if (navRef.current === n) { n.route = null; setNavUI((u) => ({ ...(u || {}), instr: "Rota alınamadı, yeniden deneniyor…" })); }
    }
  }, []);

  const arrived = useCallback(() => {
    const n = navRef.current;
    if (!n) return;
    speak("Hedefe vardın");
    const s = n.s;
    setTimeout(() => { stopNav(); setArrive({ s, mode: "ask" }); }, 400);
  }, [speak, stopNav]);

  const onPos = useCallback((loc) => {
    const n = navRef.current;
    if (!n) return;
    const me = [loc.coords.latitude, loc.coords.longitude];
    if (!n.route) {
      if (Date.now() - n.lastRoute > 8000) routeFrom(me);
      setNavUI((u) => ({ ...(u || {}), me }));
      return;
    }
    const R = n.route;
    const li = lineInfo(me, R.pts);
    // yön: GPS yönü, yoksa rota yönü, yoksa son iki konum
    let hd = loc.coords.heading != null && loc.coords.heading >= 0 && (loc.coords.speed || 0) > 1.5 ? loc.coords.heading : null;
    if (hd == null && li.d < 30) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < R.pts.length - 1; i++) { const d = lineInfo(me, [R.pts[i], R.pts[i + 1]]).d; if (d < bd) { bd = d; bi = i; } }
      hd = bearing(R.pts[bi], R.pts[bi + 1]);
    }
    if (hd == null && n.prev && dist(n.prev, me) > 4) hd = bearing(n.prev, me);
    if (hd != null) n.hd = hd;
    n.prev = me;

    if (li.d > 45) {
      n.off++;
      if (n.off >= 2 && Date.now() - n.lastRoute > 10000) {
        n.off = 0;
        speak("Rota yeniden hesaplanıyor");
        setNavUI((u) => ({ ...(u || {}), instr: "Rota yeniden hesaplanıyor…", me, hd: n.hd }));
        routeFrom(me);
        return;
      }
    } else n.off = 0;

    const along = li.f * li.len, rem = Math.max(0, li.len - along), scale = li.len / (R.len || li.len || 1);
    let i = 0;
    for (let k = 0; k < R.cum.length; k++) if (R.cum[k] * scale <= along + 5) i = k;
    const next = R.steps[i + 1] || R.steps[R.steps.length - 1];
    const toNext = Math.max(0, (R.cum[i + 1] != null ? R.cum[i + 1] * scale : li.len) - along);
    const text = instr(next), short = text.split(" · ")[0];
    const mins = Math.max(1, Math.round(((R.dur || rem / 8) * (rem / (li.len || 1))) / 60));
    const man = next && next.maneuver && next.maneuver.type !== "arrive" && next.maneuver.location
      ? { p: [next.maneuver.location[1], next.maneuver.location[0]], b: next.maneuver.bearing_after || 0 } : null;

    if (n.lastSpoken !== i + 1) {
      n.lastSpoken = i + 1; n.near = false;
      speak(next.maneuver && next.maneuver.type === "arrive" ? sayDist(toNext) + " sonra hedefe varacaksın" : sayDist(toNext) + " sonra " + short.toLocaleLowerCase("tr-TR"));
    } else if (!n.near && toNext < 70) { n.near = true; speak(short); }

    setNavUI({
      route: R.pts, me, hd: n.hd, man, follow: n.follow,
      instr: text, dist: fmtDist(toNext), rot: rotOf(next),
      eta: mins + " dk",
      rem: fmtDist(rem) + " kaldı · varış " + new Date(Date.now() + mins * 60e3).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    });
    if (n.follow && mapRef.current) {
      mapRef.current.animateCamera({ center: toLL(me), heading: n.hd || 0, pitch: 45, zoom: 17.5, altitude: 450 }, { duration: 800 });
    }
    if (dist(me, n.dest) < 40 || (rem < 30 && li.d < 45)) arrived();
  }, [arrived, routeFrom, speak]);

  const startNav = useCallback(async (s) => {
    stopNav();
    setArrive(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { say("Navigasyon için konum izni gerekiyor.", true); return; }
    navRef.current = { s, dest: segMid(s), route: null, lastRoute: 0, lastSpoken: -1, near: false, off: 0, hd: null, prev: null, follow: true, voice };
    tripRef.current.dest = tripRef.current.dest || (focus && focus.p);
    setNavUI({ instr: "Konum ve rota hazırlanıyor…", dist: "", rot: 0, eta: "", rem: s.street_name || "", follow: true });
    setSheetMin(true);
    activateKeepAwakeAsync("nav").catch(() => {});
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      onPos
    );
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (navRef.current) routeFrom([pos.coords.latitude, pos.coords.longitude]);
    } catch (e) {}
  }, [focus, onPos, routeFrom, say, stopNav, voice]);

  useEffect(() => () => stopNav(), [stopNav]);

  const goBest = useCallback(() => {
    tripRef.current = { dest: focus && focus.p, skip: [] };
    const b = best([]);
    if (!b) { say("Bu bölgede şu an uygun sokak görünmüyor.", true); return; }
    startNav(b.s);
  }, [best, focus, say, startNav]);

  const toggleVoice = useCallback(() => {
    const v = !voice;
    setVoice(v);
    if (navRef.current) navRef.current.voice = v;
    if (!v) Speech.stop();
    AsyncStorage.setItem("pp_voice", v ? "1" : "0");
  }, [voice]);

  const recenter = useCallback(() => {
    const n = navRef.current;
    if (!n) return;
    n.follow = true;
    setNavUI((u) => ({ ...(u || {}), follow: true }));
  }, []);

  // ---- varış ----
  const saveCar = useCallback(async (s) => {
    let p = segMid(s);
    try { const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); p = [pos.coords.latitude, pos.coords.longitude]; } catch (e) {}
    const x = { p, street: s.street_name, at: Date.now() };
    setCar(x);
    AsyncStorage.setItem("pp_car", JSON.stringify(x));
  }, []);

  const answer = useCallback(async (found) => {
    const s = arrive && arrive.s;
    if (!s) return;
    try { await sendFeedback(s.id, found ? "available" : "full"); } catch (e) {}
    if (found) {
      setArrive(null);
      saveCar(s);
      say("İyi parklar! Bildirimin diğer sürücülere yardımcı olacak.");
      refresh();
      return;
    }
    const skip = [...(tripRef.current.skip || []), s.id];
    tripRef.current.skip = skip;
    const b = best(skip);
    if (!b) { setArrive(null); say("Yakında başka uygun sokak yok. Biraz sonra tekrar dene.", true); return; }
    setArrive({ s, mode: "next", next: b });
  }, [arrive, best, refresh, saveCar, say]);

  const openCar = useCallback(() => {
    if (!car) return;
    const [la, lo] = car.p;
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${la},${lo}&dirflg=w` : `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${la},${lo}`;
    Linking.openURL(url);
  }, [car]);

  const clearCar = useCallback(() => { setCar(null); AsyncStorage.removeItem("pp_car"); say("Araç kaydı kaldırıldı"); }, [say]);

  const openExternal = useCallback((s) => {
    const [la, lo] = segMid(s);
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${la},${lo}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${la},${lo}`;
    Linking.openURL(url);
  }, []);

  // ---- çizim ----
  const navigating = !!navUI;
  const st = useMemo(() => styles(c, insets), [c, insets]);

  return (
    <View style={st.root}>
      <StatusBar style={navigating ? "light" : scheme === "dark" ? "light" : "dark"} />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialCamera={{ center: toLL(KIZILAY), zoom: 15, altitude: 2200, heading: 0, pitch: 0 }}
        showsUserLocation={!navigating}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapPadding={{ top: navigating ? 120 : 110, bottom: navigating ? 90 : sheetMin ? 80 : 300, left: 0, right: 0 }}
        onPanDrag={() => { if (navRef.current && navRef.current.follow) { navRef.current.follow = false; setNavUI((u) => ({ ...(u || {}), follow: false })); } }}
      >
        {!navigating && nearby.map(({ s, st: ss }) => (
          <React.Fragment key={s.id}>
            <Polyline
              coordinates={segPts(s).map(toLL)}
              strokeColor={ss.color}
              strokeWidth={6}
              lineDashPattern={ss.kind === "est" ? [2, 10] : undefined}
              tappable
              onPress={() => { setOpenId(s.id); setSheetMin(false); }}
            />
            {s.parking_status === "prohibited" && (
              <Polyline coordinates={segPts(s).map(toLL)} strokeColor="#1b1b1b" strokeWidth={2} lineDashPattern={[3, 7]} />
            )}
          </React.Fragment>
        ))}
        {!navigating && focus && !focus.isMe && <Marker coordinate={toLL(focus.p)} pinColor={BRAND} title={focus.name} />}
        {navigating && navUI.route && (
          <>
            <Polyline coordinates={navUI.route.map(toLL)} strokeColor="#ffffff" strokeWidth={11} />
            <Polyline coordinates={navUI.route.map(toLL)} strokeColor="#2a7de1" strokeWidth={7} />
          </>
        )}
        {navigating && navRef.current && (
          <Marker coordinate={toLL(navRef.current.dest)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={st.destDot} />
          </Marker>
        )}
        {navigating && navUI.man && (
          <Marker coordinate={toLL(navUI.man.p)} anchor={{ x: 0.5, y: 0.5 }} flat rotation={navUI.man.b} tracksViewChanges={false}>
            <View style={st.manDot}><View style={st.manArrow} /></View>
          </Marker>
        )}
        {navigating && navUI.me && (
          <Marker coordinate={toLL(navUI.me)} anchor={{ x: 0.5, y: 0.5 }} flat rotation={navUI.hd || 0} tracksViewChanges={false} zIndex={10}>
            <View style={st.meHalo}><View style={st.meArrow} /></View>
          </Marker>
        )}
      </MapView>

      {/* Üst: arama ya da navigasyon şeridi */}
      {!navigating ? (
        <View style={st.top}>
          <View style={st.brandRow}>
            <View style={st.logo}><View style={st.logoP}><Text style={st.logoPText}>P</Text></View><Text style={st.logoText}>PARKPUSULA</Text></View>
            {car && (
              <Pressable style={st.pill} onPress={openCar} onLongPress={clearCar} accessibilityRole="button" accessibilityHint="Uzun basınca araç kaydı silinir">
                <Text style={st.pillText}>Aracıma dön</Text>
              </Pressable>
            )}
          </View>
          <View style={st.search}>
            <TextInput
              style={st.input}
              placeholder="Nereye gidiyorsun?"
              placeholderTextColor={c.muted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              accessibilityLabel="Gidilecek yer"
            />
            {searching ? <ActivityIndicator color={c.brand} style={{ marginRight: 10 }} /> : null}
            <Pressable style={st.locBtn} onPress={locate} accessibilityRole="button" accessibilityLabel="Yakınımdakiler">
              <View style={st.locIcon} />
            </Pressable>
          </View>
          {results && results.length > 0 && (
            <View style={st.results}>
              {results.map((r, i) => (
                <Pressable key={i} style={st.resultRow} onPress={() => { setQuery(r.name); goTo(r.p, r.name, false); }}>
                  <Text style={st.resultName} numberOfLines={1}>{r.name}</Text>
                  <Text style={st.resultSub} numberOfLines={1}>{r.sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={st.navTop}>
          <View style={st.navArrowBox}><View style={{ transform: [{ rotate: (navUI.rot || 0) + "deg" }] }}><View style={st.navArrow} /></View></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!navUI.dist && <Text style={st.navDist}>{navUI.dist}</Text>}
            <Text style={st.navInstr}>{navUI.instr}</Text>
          </View>
        </View>
      )}

      {/* Alt: sokak listesi ya da navigasyon özeti */}
      {navigating ? (
        <View style={st.navBot}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.navEta}>{navUI.eta}</Text>
            <Text style={st.navRem} numberOfLines={1}>{navUI.rem}</Text>
          </View>
          {!navUI.follow && <Pressable style={st.pillSm} onPress={recenter}><Text style={st.pillSmText}>Ortala</Text></Pressable>}
          <Pressable style={st.pillSm} onPress={toggleVoice}><Text style={st.pillSmText}>{voice ? "Ses açık" : "Ses kapalı"}</Text></Pressable>
          <Pressable style={[st.pillSm, { backgroundColor: "#d64545", borderColor: "#d64545" }]} onPress={stopNav}><Text style={[st.pillSmText, { color: "#fff" }]}>Bitir</Text></Pressable>
        </View>
      ) : (
        <View style={[st.sheet, sheetMin && { maxHeight: 96 }]}>
          <Pressable onPress={() => setSheetMin((v) => !v)} style={st.grabZone} accessibilityLabel="Paneli aç veya kapat"><View style={st.grab} /></Pressable>
          <View style={st.sheetHead}>
            <Text style={st.h2} numberOfLines={1}>{focus ? focus.name : "Park yeri ara"}</Text>
            {focus && <Text style={st.count}>{nearby.length} sokak</Text>}
            {loading && <ActivityIndicator color={c.brand} />}
          </View>
          {!focus && <Text style={st.sub}>Gideceğin yeri yaz ya da konum düğmesine dokun.</Text>}
          {focus && nearby.some((x) => x.st.key !== "full" && x.s.parking_status !== "prohibited") && (
            <Pressable style={st.cta} onPress={goBest} accessibilityRole="button"><Text style={st.ctaText}>Beni boş sokağa götür</Text></Pressable>
          )}
          {focus && !nearby.length && !loading && <Text style={st.sub}>Bu bölgede henüz kayıtlı sokak yok.</Text>}
          {!sheetMin && (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {nearby.map(({ s, d, st: ss }) => {
                const open = openId === s.id;
                const rule = ruleText(s), capT = capacityText(s, ss);
                const done = voted[s.id] && Date.now() - voted[s.id] < 10 * 60e3;
                return (
                  <Pressable key={s.id} style={st.row} onPress={() => setOpenId(open ? null : s.id)}>
                    <View style={[st.dot, { backgroundColor: ss.color }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.rowTitle} numberOfLines={1}>{s.street_name || "Adsız sokak"}</Text>
                      <Text style={st.meta}>
                        <Text style={{ color: ss.color, fontWeight: "700" }}>{ss.label}{ss.score != null ? " · %" + ss.score : ""}</Text>
                        {ss.kindLabel ? "  " + ss.kindLabel : ""} · {Math.round(d)} m
                      </Text>
                      {!!rule && <Text style={[st.rule, s.parking_status === "prohibited" ? st.ruleNo : st.ruleLim]}>{rule}</Text>}
                      {open && (
                        <View style={{ marginTop: 4 }}>
                          {!!ss.detail && <Text style={st.meta}>{ss.detail}</Text>}
                          {!!capT && <Text style={st.meta}>{capT}</Text>}
                          <View style={st.voteRow}>
                            {done ? (
                              <View style={[st.voteBtn, { backgroundColor: c.soft, borderColor: c.soft }]}><Text style={{ color: c.brand, fontWeight: "700" }}>Bildirimin alındı</Text></View>
                            ) : (
                              <>
                                <Pressable style={[st.voteBtn, { borderColor: "#1f9d5566" }]} onPress={() => vote(s, "available")}><Text style={{ color: "#1f9d55", fontWeight: "700" }}>Yer var</Text></Pressable>
                                <Pressable style={[st.voteBtn, { borderColor: "#d6454566" }]} onPress={() => vote(s, "full")}><Text style={{ color: "#d64545", fontWeight: "700" }}>Yer yok</Text></Pressable>
                              </>
                            )}
                          </View>
                          <Pressable onPress={() => openExternal(s)} style={{ paddingVertical: 8 }}><Text style={{ color: c.brand, fontWeight: "600" }}>Başka harita uygulamasında aç ›</Text></Pressable>
                        </View>
                      )}
                    </View>
                    <Pressable style={st.goBtn} onPress={() => { tripRef.current = { dest: focus && focus.p, skip: [] }; startNav(s); }} accessibilityRole="button" accessibilityLabel={(s.street_name || "Sokak") + " için yol tarifi"}>
                      <Text style={st.goText}>Git</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Varış kartı */}
      {arrive && (
        <View style={st.arrive}>
          {arrive.mode === "ask" ? (
            <>
              <Text style={st.arriveText}>{(arrive.s.street_name || "Bu sokak") + ": park yeri buldun mu?"}</Text>
              <View style={st.voteRow}>
                <Pressable style={[st.voteBtn, { borderColor: "#1f9d5566" }]} onPress={() => answer(true)}><Text style={{ color: "#1f9d55", fontWeight: "700" }}>Buldum, park ettim</Text></Pressable>
                <Pressable style={[st.voteBtn, { borderColor: "#d6454566" }]} onPress={() => answer(false)}><Text style={{ color: "#d64545", fontWeight: "700" }}>Yer yoktu</Text></Pressable>
              </View>
              <Pressable onPress={() => setArrive(null)} style={{ paddingTop: 8 }}><Text style={{ color: c.brand, fontWeight: "600" }}>Kapat</Text></Pressable>
            </>
          ) : (
            <>
              <Text style={st.arriveText}>{"Sıradaki: " + (arrive.next.s.street_name || "Sokak") + " (" + arrive.next.st.label.toLocaleLowerCase("tr-TR") + "). Oraya gidelim mi?"}</Text>
              <View style={st.voteRow}>
                <Pressable style={[st.voteBtn, { backgroundColor: c.brand, borderColor: c.brand }]} onPress={() => startNav(arrive.next.s)}><Text style={{ color: c.brandInk, fontWeight: "700" }}>Evet, git</Text></Pressable>
                <Pressable style={st.voteBtn} onPress={() => setArrive(null)}><Text style={{ color: c.ink, fontWeight: "700" }}>Vazgeç</Text></Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {toast && (
        <View style={[st.toast, toast.err && { backgroundColor: "#d64545" }]} pointerEvents="none">
          <Text style={st.toastText}>{toast.msg}</Text>
        </View>
      )}
    </View>
  );
}

function styles(c, insets) {
  const shadow = { shadowColor: "#102822", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: { position: "absolute", top: insets.top + 8, left: 12, right: 12, gap: 8 },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    logo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.panel, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: 999, ...shadow },
    logoP: { width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
    logoPText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    logoText: { color: c.ink, fontWeight: "800", fontSize: 15, letterSpacing: 0.6 },
    pill: { backgroundColor: c.panel, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, ...shadow },
    pillText: { color: c.ink, fontWeight: "600", fontSize: 13 },
    search: { flexDirection: "row", alignItems: "center", backgroundColor: c.panel, borderRadius: 14, paddingLeft: 14, paddingRight: 4, ...shadow },
    input: { flex: 1, fontSize: 16, color: c.ink, paddingVertical: 12 },
    locBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.brand, alignItems: "center", justifyContent: "center", marginVertical: 4 },
    locIcon: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: c.brandInk },
    results: { backgroundColor: c.panel, borderRadius: 14, overflow: "hidden", ...shadow },
    resultRow: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    resultName: { color: c.ink, fontWeight: "700", fontSize: 15 },
    resultSub: { color: c.muted, fontSize: 12, marginTop: 2 },
    sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "50%", backgroundColor: c.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: insets.bottom + 10, ...shadow },
    grabZone: { alignItems: "center", paddingVertical: 8 },
    grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: c.line },
    sheetHead: { flexDirection: "row", alignItems: "center", gap: 10 },
    h2: { flex: 1, color: c.ink, fontSize: 18, fontWeight: "700" },
    count: { color: c.brand, backgroundColor: c.soft, fontSize: 12, fontWeight: "600", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden" },
    sub: { color: c.muted, fontSize: 13, marginTop: 4, marginBottom: 6 },
    cta: { backgroundColor: c.brand, borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center", marginVertical: 10 },
    ctaText: { color: c.brandInk, fontWeight: "700", fontSize: 15 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    rowTitle: { color: c.ink, fontSize: 15, fontWeight: "700" },
    meta: { color: c.muted, fontSize: 12.5, marginTop: 2 },
    rule: { alignSelf: "flex-start", fontSize: 12, fontWeight: "700", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, marginTop: 5, overflow: "hidden" },
    ruleNo: { backgroundColor: "#d6454522", color: "#d64545" },
    ruleLim: { backgroundColor: "#d99a0033", color: c.ink },
    voteRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    voteBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: c.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
    goBtn: { alignSelf: "center", minHeight: 42, minWidth: 56, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
    goText: { color: c.brandInk, fontWeight: "700", fontSize: 15 },
    navTop: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 12, paddingBottom: 14, paddingHorizontal: 14, backgroundColor: "#1f6f5f", flexDirection: "row", alignItems: "center", gap: 14, ...shadow },
    navArrowBox: { width: 56, height: 56, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
    navArrow: { width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderBottomWidth: 26, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#ffffff" },
    navDist: { color: "#fff", fontSize: 28, fontWeight: "800" },
    navInstr: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 2 },
    navBot: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 12, paddingHorizontal: 12, paddingBottom: insets.bottom + 12, flexDirection: "row", alignItems: "center", gap: 8, ...shadow },
    navEta: { color: c.brand, fontSize: 22, fontWeight: "800" },
    navRem: { color: c.muted, fontSize: 12.5 },
    pillSm: { borderWidth: 1.5, borderColor: c.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: c.panel },
    pillSmText: { color: c.ink, fontWeight: "600", fontSize: 13 },
    meHalo: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(42,125,225,0.18)", alignItems: "center", justifyContent: "center" },
    meArrow: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 24, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#2a7de1" },
    manDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#1f6f5f", borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
    manArrow: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 11, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#fff" },
    destDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND, borderWidth: 3, borderColor: "#fff" },
    arrive: { position: "absolute", left: 12, right: 12, top: insets.top + 130, backgroundColor: c.panel, borderRadius: 16, padding: 14, borderWidth: 2, borderColor: c.brand, ...shadow },
    arriveText: { color: c.ink, fontWeight: "600", fontSize: 15 },
    toast: { position: "absolute", top: insets.top + 12, alignSelf: "center", maxWidth: "90%", backgroundColor: c.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
    toastText: { color: c.bg, fontWeight: "600", fontSize: 14 },
  });
}
