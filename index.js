import "react-native-url-polyfill/auto";
import { registerRootComponent } from "expo";
import "./src/autopark"; // arka plan görevi açılışta tanımlanmalı
import App from "./App";

registerRootComponent(App);
