"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/game-store";

export default function ActionCardReveal() {
  const { actionCardReveal, setActionCardReveal } = useGameStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (actionCardReveal) {
      // Delay to ensure the DOM has rendered the scale-0 state before transitioning to scale-100
      const inTimer = setTimeout(() => setVisible(true), 50);

      const outTimer = setTimeout(() => {
        setVisible(false);
        // Clear state after animation finishes
        setTimeout(() => setActionCardReveal(null), 500);
      }, 4000); // Increased time slightly so people can read it

      return () => {
        clearTimeout(inTimer);
        clearTimeout(outTimer);
      };
    } else {
      setVisible(false);
    }
  }, [actionCardReveal, setActionCardReveal]);

  if (!actionCardReveal && !visible) return null;

  const isChance = actionCardReveal?.type === "CHANCE";

  return (
    <div className="fixed top-1/2 -translate-y-1/2 left-4 z-[9999] pointer-events-none">
      <div 
        className={`deckled-edges parchment-card shadow-2xl rounded-sm p-5 w-64 border border-[#d4ba96] text-[#4a3420] transform transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          visible ? "translate-x-0 opacity-100" : "-translate-x-[150%] opacity-0"
        }`}
      >
        <div className="text-center mb-3 pb-2 border-b border-[#cca97f]/40">
          <h2 className="text-[16px] font-black tracking-widest text-[#8e291c] uppercase font-serif">
            {isChance ? "Chance" : "Community Chest"}
          </h2>
        </div>
        <div className="text-center">
          <p className="text-[#3d2915] text-[13px] leading-snug font-bold">
            {actionCardReveal?.description}
          </p>
        </div>
      </div>
    </div>
  );
}
