import { motion, AnimatePresence } from "framer-motion";

export default function NotificationPanel({ notifications }) {
  return (
    <div className="bg-[#10182B] border border-white/10 rounded-2xl p-5 shadow-xl h-full flex flex-col">
      <h2 className="text-white font-semibold mb-3">Notifications</h2>
      <div className="overflow-y-auto space-y-2 pr-1">
        {notifications.length === 0 && (
          <p className="text-white/40 text-sm">No notifications yet.</p>
        )}
        <AnimatePresence initial={false}>
          {notifications.map((n, i) => (
            i === 0 ? (
              <motion.div
                key={n.time}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-primary/20 border border-primary/60 rounded-lg px-3 py-3 text-sm shadow-lg shadow-primary/10"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <span className="text-primary text-xs font-semibold uppercase tracking-wide">Current</span>
                </div>
                <p className="text-white font-bold leading-snug">{n.message}</p>
                <p className="text-white/40 text-xs mt-1">
                  {new Date(n.time).toLocaleTimeString()}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={n.time}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 0.6, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white/5 rounded-lg px-3 py-2 text-sm"
              >
                <p className="text-white/80">{n.message}</p>
                <p className="text-white/30 text-xs mt-0.5">
                  {new Date(n.time).toLocaleTimeString()}
                </p>
              </motion.div>
            )
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
