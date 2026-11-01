// app.json'u genişletir: gizli anahtarlar kodda değil, derleme ortamı değişkenlerinde durur.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: { apiKey: process.env.ANDROID_MAPS_KEY || "" },
    },
  },
  extra: {
    ...(config.extra || {}),
    supabaseUrl: "https://mldbdpgznssnnoxljmqs.supabase.co",
    // Herkese açık (anon) anahtar: veritabanı satır güvenlik kurallarıyla korunur.
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZGJkcGd6bnNzbm5veGxqbXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzMzMTMsImV4cCI6MjEwODk0OTMxM30.Lih9sEgn2SOGhIccGuvNf7w5JsGTv5YFM4P3wRZFwxk",
  },
});
