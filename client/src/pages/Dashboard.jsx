import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import logo from "../assets/logo.png";
import bg from "../assets/Background_Image.png";
import { motion } from "framer-motion";
import { api, socket } from "../lib/api";
import MissionTracker from "../components/MissionTracker";
import WeatherCard from "../components/WeatherCard";
import TelemetryPanel from "../components/TelemetryPanel";
import MapView from "../components/MapView";
import NotificationPanel from "../components/NotificationPanel";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [mission, setMission] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [weather, setWeather] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(new Date());
  const [simulatorOn, setSimulatorOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    api.getMission().then((m) => {
      setMission(m);
      setTelemetry(m.telemetry);
      setWeather(m.weather);
      setSimulatorOn(m.simulatorEnabled);
    });

    socket.on("missionState", (m) => setMission((prev) => ({ ...m, route: prev?.route })));
    socket.on("telemetry", (t) => setTelemetry(t));
    socket.on("weather", (w) => setWeather(w));
    socket.on("notification", (n) => setNotifications((prev) => [n, ...prev].slice(0, 50)));

    return () => {
      socket.off("missionState");
      socket.off("telemetry");
      socket.off("weather");
      socket.off("notification");
    };
  }, []);

  async function handleStart() {
    setBusy(true);
    setNotifications([]);
    try {
      await api.startMission();
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setNotifications([]);
    await api.resetMission();
  }

  async function toggleSimulator() {
    const res = await api.setSimulator(!simulatorOn);
    setSimulatorOn(res.simulatorEnabled);
  }

  async function openHistory() {
    const h = await api.getHistory();
    setHistory(h);
    setShowHistory(true);
  }

  if (!mission || !telemetry) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex items-center justify-center bg-[#0A0F1E] text-white/50"
      >
        Connecting to SkyClerk server...
      </motion.div>
    );
  }

  const status = mission.status;
  const canStart = status === "IDLE" || status === "COMPLETED" || status === "WEATHER_UNSAFE";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen relative bg-[#0A0F1E] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bg})` }}
    >
      <div className="absolute inset-0 bg-[#0A0F1E]/85 pointer-events-none" />
      <div className="relative z-10">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <img src={logo} alt="SkyClerk" className="h-10 rounded-lg" />
        </div>
        <div className="flex items-center gap-4 text-sm text-white/60">
          <span>{user?.email}</span>
          <span className="font-mono">{now.toLocaleTimeString()}</span>
          <button onClick={openHistory} className="hover:text-white transition">
            History
          </button>
          <button onClick={logout} className="hover:text-danger transition">
            Logout
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 bg-[#10182B] border border-white/10 rounded-2xl p-4">
          <button
            onClick={handleStart}
            disabled={!canStart || busy}
            className="bg-primary hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium transition"
          >
            {busy ? "Starting..." : "Start Mission"}
          </button>
          <button
            onClick={handleReset}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition"
          >
            Reset
          </button>
          <label className="flex items-center gap-2 text-sm text-white/60 ml-auto cursor-pointer select-none">
            <input type="checkbox" checked={simulatorOn} onChange={toggleSimulator} />
            Simulator Mode (no ESP32 needed)
          </label>
          {status === "WEATHER_UNSAFE" && (
            <span className="text-danger text-sm font-medium">
              Mission cannot begin due to unsafe weather conditions.
            </span>
          )}
        </div>

        <MissionTracker status={status} />

        <div className="grid lg:grid-cols-3 gap-6 items-stretch">
          <div className="space-y-6 lg:col-span-1">
            <WeatherCard weather={weather} />
            <TelemetryPanel
              telemetry={telemetry}
              missionId={mission.id}
              status={status}
              payload={mission.payload}
            />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <MapView telemetry={telemetry} route={mission.route} />
          </div>
          <div className="lg:col-span-1 flex flex-col">
            <NotificationPanel notifications={notifications} />
          </div>
        </div>
      </main>

      {showHistory && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="bg-[#10182B] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold text-lg">Mission History</h2>
              <button onClick={() => setShowHistory(false)} className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>
            {history.length === 0 && <p className="text-white/40 text-sm">No missions recorded yet.</p>}
            <div className="space-y-2">
              {history.map((m) => (
                <div key={m.id} className="bg-white/5 rounded-lg p-3 text-sm flex justify-between">
                  <div>
                    <p className="text-white font-medium">{m.id}</p>
                    <p className="text-white/40">{new Date(m.startTime).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={m.success ? "text-success" : "text-danger"}>
                      {m.success ? "Success" : "Incomplete"}
                    </p>
                    <p className="text-white/40">
                      {m.durationSeconds ? `${m.durationSeconds}s` : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </motion.div>
  );
}
