"use client";

import { useGameStore, type EventLogEntry } from "@/store/game-store";

const TYPE_COLORS: Record<string, string> = {
  info: "text-[#4a4a4a] font-semibold",
  buy: "text-[#246e45] font-bold",
  rent: "text-[#875d16] font-bold",
  bankrupt: "text-[#9c2b2b] font-bold",
  shuffle: "text-[#1d6b7b] font-bold",
  card: "text-[#285e96] font-bold",
  jail: "text-[#875d16] font-bold",
  move: "text-[#5a564c] font-semibold",
};

export default function EventLog() {
  const eventLog = useGameStore((s) => s.eventLog);

  if (eventLog.length === 0) {
    return (
      <div className="text-[#8a7f66] font-medium py-2 text-center italic">
        Game events will appear here...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {[...eventLog].reverse().slice(0, 30).map((entry, idx) => {
        // Parse timestamp from createdAt
        const now = new Date(entry.createdAt);
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        return (
          <div key={`${entry.id}-${idx}`} className="flex items-start gap-2">
            <span className="text-[#8a7f66] font-medium shrink-0">{timeStr}</span>
            <span className={`${TYPE_COLORS[entry.type] || "text-[#4a4a4a]"}`}>
              {entry.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
