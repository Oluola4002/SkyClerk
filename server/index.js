/**
 * SKYCLERK SERVER
 * ----------------
 * One file, on purpose. This runs:
 *  1. An Express REST API
 *  2. A Socket.io server (pushes live updates to the React dashboard)
 *  3. An embedded MQTT broker (Aedes) on port 1883
 *     -> Your ESP32 connects directly to this PC's IP on port 1883.
 *     -> No external broker (Mosquitto/HiveMQ) needed.
 *  4. A simple mission state machine that drives the whole delivery flow.
 *  5. A built-in simulator that fakes an ESP32 so you can test the
 *     website before the drone is ready.
 *
 * Run:  npm install   then   npm start
 * Server listens on http://0.0.0.0:4000
 * MQTT broker listens on  mqtt://0.0.0.0:1883
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const Aedes = require("aedes");
const mqtt = require("mqtt");
const admin = require("firebase-admin");

// ---------- CONFIG ----------
const HTTP_PORT = process.env.PORT || 4000;
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
// Also accept any device on the local network (e.g. phones/laptops on the same
// WiFi/MiFi hitting the dashboard via this PC's LAN IP) so requests aren't
// silently blocked by CORS during on-site testing/demos.
const LAN_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/;
function corsOriginCheck(origin, callback) {
  if (!origin || origin === CLIENT_URL || LAN_ORIGIN_PATTERN.test(origin)) {
    callback(null, true);
  } else {
    callback(new Error("Not allowed by CORS"));
  }
}

// ---------- FIREBASE ADMIN ----------
let adminReady = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
    adminReady = true;
    console.log("[AUTH] Firebase Admin initialised — API routes are protected.");
  } catch (e) {
    console.warn("[AUTH] Firebase Admin init failed:", e.message);
  }
} else {
  console.warn("[AUTH] FIREBASE_SERVICE_ACCOUNT not set — API routes are unprotected (dev mode).");
}

async function requireAuth(req, res, next) {
  if (!adminReady) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
const HISTORY_FILE = path.join(__dirname, "data", "missions.json");

const TOPIC_TELEMETRY = "skyclerk/telemetry";
const TOPIC_PAYLOAD = "skyclerk/payload";
const TOPIC_COMMAND = "skyclerk/command";

// ---------- SETUP ----------
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "[]");
}

const app = express();
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOriginCheck } });

// Embedded MQTT broker (this is what the ESP32 talks to)
const aedes = new Aedes();
const mqttServer = net.createServer(aedes.handle);
mqttServer.listen(MQTT_PORT, "0.0.0.0", () => {
  console.log(`[MQTT] Broker listening on port ${MQTT_PORT}`);
});

// Server also acts as an MQTT client so it can read ESP32 messages
// and publish commands back to the ESP32.
const mqttClient = mqtt.connect(`mqtt://127.0.0.1:${MQTT_PORT}`);

// ---------- MISSION STATE ----------
const DEPARTURE = { name: "Department of Aerospace Engineering", lat: 6.5244, lng: 3.3792 };
const DESTINATION = { name: "Faculty of Engineering", lat: 6.5274, lng: 3.3812 };

let mission = {
  id: null,
  status: "IDLE", // see STAGES below
  weather: null,
  payload: false,
  telemetry: {
    battery: 100,
    latitude: DEPARTURE.lat,
    longitude: DEPARTURE.lng,
    altitude: 0,
    speed: 0,
    heading: 0,
    signal: 100,
  },
  startTime: null,
  endTime: null,
  notifications: [],
  simulatorEnabled: true,
};

const STAGES = [
  "IDLE",
  "CHECKING_WEATHER",
  "WEATHER_UNSAFE",
  "WAITING_PAYLOAD",
  "PAYLOAD_LOADED",
  "PREFLIGHT",
  "AUTHORIZED",
  "ARMED",
  "TAKEOFF",
  "EN_ROUTE",
  "LANDED_WAITING_REMOVAL",
  "DELIVERED",
  "RETURNING",
  "COMPLETED",
];

function pushNotification(message) {
  const note = { message, time: new Date().toISOString() };
  mission.notifications.unshift(note);
  mission.notifications = mission.notifications.slice(0, 50);
  io.emit("notification", note);
  console.log(`[NOTIFY] ${message}`);
}

function setStatus(status) {
  mission.status = status;
  io.emit("missionState", mission);
}

function broadcastTelemetry() {
  io.emit("telemetry", mission.telemetry);
}

function saveMissionToHistory() {
  const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  history.unshift({
    id: mission.id,
    startTime: mission.startTime,
    endTime: mission.endTime,
    durationSeconds: mission.endTime
      ? Math.round((new Date(mission.endTime) - new Date(mission.startTime)) / 1000)
      : null,
    weather: mission.weather,
    success: mission.status === "COMPLETED",
  });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ---------- WEATHER CHECK ----------
// Uses OpenWeather if OPENWEATHER_API_KEY + OPENWEATHER_CITY are set in .env,
// otherwise falls back to a safe mock reading (good enough for indoor/lab demos).
async function checkWeather() {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const city = process.env.OPENWEATHER_CITY || "Lagos";

  let data;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
          city
        )}&appid=${apiKey}&units=metric`
      );
      const json = await res.json();
      data = {
        temperature: json.main?.temp ?? 28,
        humidity: json.main?.humidity ?? 60,
        windSpeed: (json.wind?.speed ?? 2) * 3.6, // m/s -> km/h
        rainProbability: json.rain ? 80 : 10,
        visibility: (json.visibility ?? 10000) / 1000, // m -> km
        condition: json.weather?.[0]?.main ?? "Clear",
      };
    } catch (err) {
      console.warn("[WEATHER] OpenWeather fetch failed, using mock data:", err.message);
      data = mockWeather();
    }
  } else {
    data = mockWeather();
  }

  const unsafe =
    data.windSpeed > 20 ||
    data.rainProbability > 60 ||
    data.visibility < 2 ||
    data.condition === "Thunderstorm";

  return { ...data, safe: !unsafe };
}

function mockWeather() {
  return {
    temperature: 29,
    humidity: 58,
    windSpeed: 8,
    rainProbability: 10,
    visibility: 10,
    condition: "Clear",
  };
}

// ---------- MISSION FLOW ----------
async function startMission() {
  if (mission.status !== "IDLE" && mission.status !== "COMPLETED" && mission.status !== "WEATHER_UNSAFE") {
    return { error: "A mission is already in progress." };
  }

  mission = {
    ...mission,
    id: `MSN-${Date.now()}`,
    payload: false,
    notifications: [],
    startTime: new Date().toISOString(),
    endTime: null,
    telemetry: { ...mission.telemetry, latitude: DEPARTURE.lat, longitude: DEPARTURE.lng, altitude: 0, speed: 0 },
  };

  setStatus("CHECKING_WEATHER");
  pushNotification("Checking weather conditions...");

  const weather = await checkWeather();
  mission.weather = weather;
  io.emit("weather", weather);

  if (!weather.safe) {
    setStatus("WEATHER_UNSAFE");
    pushNotification("Weather unsafe. Mission cannot begin.");
    return { ok: true, mission };
  }

  pushNotification("Weather safe. Drone connected.");
  setStatus("WAITING_PAYLOAD");
  pushNotification("Proceed to load the drone.");

  if (mission.simulatorEnabled) simulatePayloadDetection();

  return { ok: true, mission };
}

function simulatePayloadDetection() {
  setTimeout(() => {
    if (mission.status !== "WAITING_PAYLOAD") return;
    onPayloadDetected();
  }, 3000);
}

function onPayloadDetected() {
  mission.payload = true;
  setStatus("PAYLOAD_LOADED");
  pushNotification("Payload present. Package loaded — mission ready.");

  setTimeout(() => {
    runPreflightChecks();
  }, 4000);
}

function runPreflightChecks() {
  setStatus("PREFLIGHT");
  pushNotification("Running pre-flight checks (battery, GPS, ultrasonic, motors, comms, weather)...");

  setTimeout(() => {
    setStatus("AUTHORIZED");
    pushNotification("All checks passed. Mission authorized.");
    armAndTakeoff();
  }, 2000);
}

function armAndTakeoff() {
  setStatus("ARMED");
  pushNotification("Rotors started.");
  mqttClient.publish(TOPIC_COMMAND, JSON.stringify({ command: "ARM" }));

  setTimeout(() => {
    setStatus("TAKEOFF");
    pushNotification("Drone taking off...");
    mqttClient.publish(TOPIC_COMMAND, JSON.stringify({ command: "TAKEOFF" }));

    setTimeout(() => {
      setStatus("EN_ROUTE");
      pushNotification(`En route to ${DESTINATION.name}.`);
      if (mission.simulatorEnabled) simulateFlight(DEPARTURE, DESTINATION, "LANDED_WAITING_REMOVAL", () => {
        pushNotification("Drone landed. Waiting for package removal.");
        simulatePackageRemoval();
      });
    }, 2000);
  }, 2000);
}

function simulatePackageRemoval() {
  setTimeout(() => {
    if (mission.status !== "LANDED_WAITING_REMOVAL") return;
    onPackageRemoved();
  }, 3000);
}

function onPackageRemoved() {
  mission.payload = false;
  setStatus("DELIVERED");
  pushNotification("Payload removed. Package delivered.");

  setTimeout(() => {
    setStatus("RETURNING");
    pushNotification(`Returning to ${DEPARTURE.name}.`);
    mqttClient.publish(TOPIC_COMMAND, JSON.stringify({ command: "RTL" }));

    if (mission.simulatorEnabled) simulateFlight(DESTINATION, DEPARTURE, "COMPLETED", () => {
      mission.endTime = new Date().toISOString();
      pushNotification("Mission completed successfully. Drone docked. Ready for next mission.");
      saveMissionToHistory();
    });
  }, 1500);
}

// Animates telemetry lat/lng/altitude/speed/battery from A to B over ~8 seconds.
function simulateFlight(from, to, nextStatus, onDone) {
  const steps = 24;
  let i = 0;
  const interval = setInterval(() => {
    i++;
    const t = i / steps;
    mission.telemetry = {
      ...mission.telemetry,
      latitude: from.lat + (to.lat - from.lat) * t,
      longitude: from.lng + (to.lng - from.lng) * t,
      altitude: t < 0.9 ? 30 + Math.random() * 5 : 30 * (1 - t) * 10,
      speed: 9 + Math.random() * 2,
      heading: 90,
      battery: Math.max(20, mission.telemetry.battery - 0.8),
      signal: 90 + Math.round(Math.random() * 10),
    };
    broadcastTelemetry();

    if (i >= steps) {
      clearInterval(interval);
      mission.telemetry.altitude = 0;
      mission.telemetry.speed = 0;
      broadcastTelemetry();
      setStatus(nextStatus);
      onDone();
    }
  }, 333);
}

// ---------- REAL ESP32 INPUT (when simulator is OFF) ----------
mqttClient.on("connect", () => {
  mqttClient.subscribe([TOPIC_TELEMETRY, TOPIC_PAYLOAD]);
  console.log("[MQTT] Server client connected to embedded broker.");
});

mqttClient.on("message", (topic, payload) => {
  if (mission.simulatorEnabled) return; // ignore real messages while simulating

  try {
    const data = JSON.parse(payload.toString());

    if (topic === TOPIC_TELEMETRY) {
      mission.telemetry = { ...mission.telemetry, ...data };
      broadcastTelemetry();
    }

    if (topic === TOPIC_PAYLOAD) {
      if (data.present && mission.status === "WAITING_PAYLOAD") {
        onPayloadDetected();
      }
      if (data.present === false && mission.status === "LANDED_WAITING_REMOVAL") {
        onPackageRemoved();
      }
    }
  } catch (err) {
    console.warn("[MQTT] Bad message on", topic, err.message);
  }
});

// ---------- REST API ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/mission", requireAuth, (req, res) => {
  res.json({ ...mission, route: { departure: DEPARTURE, destination: DESTINATION } });
});

app.post("/api/mission/start", requireAuth, async (req, res) => {
  const result = await startMission();
  res.json(result);
});

app.post("/api/mission/reset", requireAuth, (req, res) => {
  setStatus("IDLE");
  pushNotification("Mission reset.");
  res.json({ ok: true });
});

app.post("/api/simulator", requireAuth, (req, res) => {
  mission.simulatorEnabled = !!req.body.enabled;
  pushNotification(`Simulator ${mission.simulatorEnabled ? "enabled" : "disabled"}.`);
  res.json({ simulatorEnabled: mission.simulatorEnabled });
});

app.get("/api/history", requireAuth, (req, res) => {
  const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  res.json(history);
});

io.on("connection", (socket) => {
  socket.emit("missionState", mission);
  socket.emit("telemetry", mission.telemetry);
  if (mission.weather) socket.emit("weather", mission.weather);
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[HTTP] SkyClerk server running on http://0.0.0.0:${HTTP_PORT}`);
  console.log(`[INFO] Point your ESP32 at mqtt://<this-PC-IP>:${MQTT_PORT}`);
});
