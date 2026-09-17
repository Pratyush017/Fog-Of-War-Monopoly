"use client";

import { memo, useMemo } from "react";
import { useGameStore } from "@/store/game-store";

// Individual player token — memoized so only the moving token re-renders
const PlayerToken = memo(function PlayerToken({
  x,
  y,
  color,
  avatar,
  name,
  size,
}: {
  x: number;
  y: number;
  color: string;
  avatar: string | null;
  name: string;
  size: number;
}) {
  return (
    <div
      className="absolute top-0 left-0 rounded-full border-[3px] border-surface-container-highest shadow-2xl flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: color || "#333",
        transform: `translate(${x}px, ${y}px)`,
        willChange: "transform",
        transition: "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: `0 0 10px ${color}80, 0 4px 6px -1px rgba(0, 0, 0, 0.5)`,
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/avatars/${avatar}.svg`} alt={name} className="w-5 h-5 drop-shadow-md" />
      ) : (
        <span className="text-xs font-bold text-white drop-shadow-md">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
});

export default function TokenLayer() {
  // Slice only what we need from the store
  const players = useGameStore((s) => s.players);
  const tileCoordinates = useGameStore((s) => s.tileCoordinates);

  const activePlayers = useMemo(() => players.filter((p) => !p.isBankrupt), [players]);

  const size = 32;

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {activePlayers.map((p) => {
        const coord = tileCoordinates[p.position];
        if (!coord) return null;

        // Calculate offset if multiple players share same position
        const sharingPlayers = activePlayers.filter((ap) => ap.position === p.position);
        const offsetIndex = sharingPlayers.findIndex((ap) => ap.id === p.id);

        let offsetX = 0;
        let offsetY = 0;
        if (sharingPlayers.length > 1) {
          const angle = (offsetIndex / sharingPlayers.length) * Math.PI * 2;
          const radius = 12;
          offsetX = Math.cos(angle) * radius;
          offsetY = Math.sin(angle) * radius;
        }

        return (
          <PlayerToken
            key={p.id}
            x={coord.x - size / 2 + offsetX}
            y={coord.y - size / 2 + offsetY}
            color={p.color}
            avatar={p.avatar}
            name={p.name}
            size={size}
          />
        );
      })}
    </div>
  );
}
