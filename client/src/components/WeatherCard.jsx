export default function WeatherCard({ weather }) {
  if (!weather) {
    return (
      <div className="bg-[#10182B] border border-white/10 rounded-2xl p-5 shadow-xl">
        <h2 className="text-white font-semibold mb-2">Weather</h2>
        <p className="text-white/40 text-sm">Press "Start Mission" to check current weather.</p>
      </div>
    );
  }

  const rows = [
    ["Temperature", `${Math.round(weather.temperature)}°C`],
    ["Humidity", `${Math.round(weather.humidity)}%`],
    ["Wind Speed", `${Math.round(weather.windSpeed)} km/h`],
    ["Rain Probability", `${Math.round(weather.rainProbability)}%`],
    ["Visibility", `${weather.visibility} km`],
    ["Condition", weather.condition],
  ];

  return (
    <div className="bg-[#10182B] border border-white/10 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">Weather</h2>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            weather.safe ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
          }`}
        >
          {weather.safe ? "Safe To Fly" : "Not Safe To Fly"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between bg-white/5 rounded-lg px-3 py-2">
            <span className="text-white/50">{label}</span>
            <span className="text-white font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
