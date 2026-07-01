# SkyClerk

Smart Autonomous Drone Delivery Monitoring System — final year thesis build.

A real-time dashboard that walks a drone delivery mission through: Weather check →
Payload loading → Pre-flight checks → Takeoff → En Route → Delivered → Return →
Mission Complete — with live telemetry, a live map, and notifications. Includes
a built-in simulator so you can demo and test the whole flow before your ESP32
hardware is ready, then flip a switch to take real data from the drone.

## How it's structured

```
skyclerk/
  server/   Node.js backend: REST API + Socket.io (live updates) + an embedded
            MQTT broker your ESP32 connects to directly. No separate broker
            install needed.
  client/   React + Vite dashboard (Firebase login, live map, telemetry, etc.)
  esp32/    Starter Arduino sketch for the drone side.
```

## 1. Run the backend

```bash
cd server
npm install
cp .env.example .env      # optional — fill in OpenWeather key if you have one
npm start
```

You should see:
```
[MQTT] Broker listening on port 1883
[HTTP] SkyClerk server running on http://0.0.0.0:4000
```

Find this PC's local network IP (so the frontend and ESP32 can reach it):
- Windows: `ipconfig` → look for IPv4 Address
- Mac/Linux: `ifconfig` or `ip addr` → look for something like `192.168.x.x`

## 2. Set up Firebase Auth (login)

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a project.
2. Build > Authentication > Get Started > enable **Email/Password** sign-in.
3. Authentication > Users > Add User — create your login (e.g. admin@skyclerk.com).
4. Project Settings > General > Your apps > Add app > Web app — copy the config values.

## 3. Run the frontend

```bash
cd client
npm install
cp .env.example .env
```

Edit `client/.env`:
```
VITE_SERVER_URL=http://<this-PC-IP>:4000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Then:
```bash
npm run dev -- --host
```

Open the printed "Network" URL on any device on the same WiFi (phone, laptop, etc).
Log in with the Firebase user you created.

## 4. Test it (no drone needed yet)

On the dashboard, leave **Simulator Mode** checked and click **Start Mission**.
The whole flow runs automatically using fake telemetry, so you can demo and
debug the website end-to-end.

## 5. Connect the real ESP32

1. Open `esp32/skyclerk_esp32.ino` in Arduino IDE.
2. Install libraries: PubSubClient, ArduinoJson (Library Manager).
3. Edit the WiFi name/password and set `MQTT_SERVER` to this PC's IP.
4. Replace the placeholder sensor functions (`readBattery`, `readLatitude`, etc.)
   with your real GPS/battery/flight-controller readings.
5. Flash it, power the drone, make sure it's on the same WiFi as the server PC.
6. On the dashboard, **uncheck Simulator Mode**. Telemetry and payload status now
   come straight from the ESP32 over MQTT; the dashboard updates in real time.

The ESP32 only needs to know one address: `mqtt://<server-PC-IP>:1883`. Everything
else (weather check, mission state, history, notifications) is handled by the server.

## Mission history

Stored in `server/data/missions.json` automatically — no database setup required.
View it any time from the **History** button on the dashboard.

## Notes for the thesis writeup

- MQTT broker is embedded in the Node server (using `aedes`), so there's only one
  process to run on the demo day — simpler to explain and less that can go wrong.
- Weather safety thresholds (wind > 20 km/h, rain probability > 60%, visibility < 2km,
  thunderstorm) are implemented in `server/index.js` → `checkWeather()`.
- If you don't set up an OpenWeather API key, the system uses safe mock weather data
  so the demo still runs indoors.
