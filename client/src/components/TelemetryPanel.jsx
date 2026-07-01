export default function TelemetryPanel({ telemetry, missionId, status, payload }) {
  const rows = [
    ["Latitude", telemetry.latitude?.toFixed(5)],
    ["Longitude", telemetry.longitude?.toFixed(5)],
    ["Altitude", `${Math.round(telemetry.altitude)} m`],
    ["Speed", `${telemetry.speed?.toFixed(1)} m/s`],
    ["Heading", `${Math.round(telemetry.heading)}°`],
    ["Battery", `${Math.round(telemetry.battery)}%`],
    ["Signal", `${Math.round(telemetry.signal)}%`],
    ["Payload", payload ? "Loaded" : "Empty"],
  ];

  return (
    <div className="bg-[#10182B] border border-white/10 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">Live Telemetry</h2>
        <span className="text-xs text-white/40">{missionId || "No active mission"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between bg-white/5 rounded-lg px-3 py-2">
            <span className="text-white/50">{label}</span>
            <span className="text-accent font-mono">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-white/40">Status: {status}</div>
    </div>
  );
}
