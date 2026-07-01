import { io } from "socket.io-client";
import { auth } from "./firebase";

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export const socket = io(SERVER_URL, { autoConnect: true });

async function request(path, options = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  getMission: () => request("/api/mission"),
  startMission: () => request("/api/mission/start", { method: "POST" }),
  resetMission: () => request("/api/mission/reset", { method: "POST" }),
  setSimulator: (enabled) =>
    request("/api/simulator", { method: "POST", body: JSON.stringify({ enabled }) }),
  getHistory: () => request("/api/history"),
};
