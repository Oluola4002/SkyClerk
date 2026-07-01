const STEPS = [
  { key: "CHECKING_WEATHER", label: "Weather" },
  { key: "WAITING_PAYLOAD", label: "Payload" },
  { key: "PREFLIGHT", label: "Pre-flight" },
  { key: "TAKEOFF", label: "Takeoff" },
  { key: "EN_ROUTE", label: "En Route" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "RETURNING", label: "Return" },
  { key: "COMPLETED", label: "Mission Complete" },
];

// Maps every backend status to "how far through STEPS we are" (0-based index, inclusive)
const STATUS_PROGRESS = {
  IDLE: -1,
  CHECKING_WEATHER: 0,
  WEATHER_UNSAFE: 0,
  WAITING_PAYLOAD: 1,
  PAYLOAD_LOADED: 1,
  PREFLIGHT: 2,
  AUTHORIZED: 2,
  ARMED: 3,
  TAKEOFF: 3,
  EN_ROUTE: 4,
  LANDED_WAITING_REMOVAL: 4,
  DELIVERED: 5,
  RETURNING: 6,
  COMPLETED: 7,
};

export default function MissionTracker({ status }) {
  const currentIndex = STATUS_PROGRESS[status] ?? -1;

  return (
    <div className="bg-[#10182B] border border-white/10 rounded-2xl p-5 shadow-xl">
      <h2 className="text-white font-semibold mb-4">Mission Progress</h2>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.key} className="flex items-center gap-2">
              <div
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? "bg-primary border-primary text-white animate-pulse"
                    : done
                    ? "bg-success/20 border-success text-success"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}
              >
                {step.label}
              </div>
              {i < STEPS.length - 1 && <span className="text-white/20">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
