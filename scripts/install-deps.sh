#!/usr/bin/env bash
# Bağımlılıkları Expo SDK sürümüyle uyumlu olarak kurar.
# Sürümleri elle sabitlemek yerine "expo install" kullanılır; böylece SDK'ya uygun sürüm seçilir.
set -euo pipefail

npm install --no-audit --no-fund

npx expo install \
  react react-native \
  react-native-maps \
  react-native-safe-area-context \
  expo-location \
  expo-task-manager \
  expo-speech \
  expo-keep-awake \
  expo-status-bar \
  expo-crypto \
  expo-constants \
  expo-build-properties \
  @react-native-async-storage/async-storage

npm install --no-audit --no-fund @supabase/supabase-js react-native-url-polyfill

# Son kontrol: tüm Expo paketlerini SDK ile hizala
npx expo install --fix
