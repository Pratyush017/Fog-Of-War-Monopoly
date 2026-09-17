"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export interface AvatarOption {
  id: string;
  name: string;
  trait: string;
  colorClass: string;
  shadowClass: string;
  btnClass: string;
  glowColor: string;
  ambientColor: string;
  statusColorText: string;
  hexColor: string;
  paddingClass: string;
}

export const AVATARS: Record<string, AvatarOption> = {
  cat: {
    id: "cat",
    name: "Brown",
    trait: "Clever & Swift",
    colorClass: "bg-cyan-500",
    shadowClass: "shadow-cyan-500/50",
    btnClass: "bg-cyan-500 text-white shadow-cyan-500/40 hover:bg-cyan-400",
    glowColor: "bg-cyan-400",
    ambientColor: "#06b6d4",
    statusColorText: "text-cyan-400",
    hexColor: "#06b6d4",
    paddingClass: "p-2.5",
  },
  fox: {
    id: "fox",
    name: "Red",
    trait: "Sharp & Cunning",
    colorClass: "bg-rose-500",
    shadowClass: "shadow-rose-500/50",
    btnClass: "bg-rose-600 text-white shadow-rose-600/40 hover:bg-rose-500",
    glowColor: "bg-rose-500",
    ambientColor: "#f43f5e",
    statusColorText: "text-rose-400",
    hexColor: "#f43f5e",
    paddingClass: "p-2",
  },
  dog: {
    id: "dog",
    name: "Yellow",
    trait: "Loyal & Friendly",
    colorClass: "bg-amber-500",
    shadowClass: "shadow-amber-500/50",
    btnClass: "bg-amber-500 text-stone-950 font-bold shadow-amber-500/40 hover:bg-amber-400",
    glowColor: "bg-amber-400",
    ambientColor: "#f59e0b",
    statusColorText: "text-amber-400",
    hexColor: "#f59e0b",
    paddingClass: "p-2",
  },
  bear: {
    id: "bear",
    name: "Green",
    trait: "Sturdy & Grounded",
    colorClass: "bg-emerald-500",
    shadowClass: "shadow-emerald-500/50",
    btnClass: "bg-emerald-500 text-white shadow-emerald-500/40 hover:bg-emerald-400",
    glowColor: "bg-emerald-400",
    ambientColor: "#10b981",
    statusColorText: "text-emerald-400",
    hexColor: "#10b981",
    paddingClass: "p-2",
  },
  bunny: {
    id: "bunny",
    name: "Beige",
    trait: "Quick & Agile",
    colorClass: "bg-purple-500",
    shadowClass: "shadow-purple-500/50",
    btnClass: "bg-purple-600 text-white shadow-purple-600/40 hover:bg-purple-500",
    glowColor: "bg-purple-400",
    ambientColor: "#a855f7",
    statusColorText: "text-purple-400",
    hexColor: "#a855f7",
    paddingClass: "p-1",
  },
  owl: {
    id: "owl",
    name: "Purple",
    trait: "Wise & Observant",
    colorClass: "bg-indigo-500",
    shadowClass: "shadow-indigo-500/50",
    btnClass: "bg-indigo-600 text-white shadow-indigo-600/40 hover:bg-indigo-500",
    glowColor: "bg-indigo-400",
    ambientColor: "#6366f1",
    statusColorText: "text-indigo-400",
    hexColor: "#6366f1",
    paddingClass: "p-2",
  },
};

const avatarKeys = Object.keys(AVATARS);

interface Props {
  selectedAvatar: string | null;
  onSelectAvatar: (avatarId: string) => void;
  onConfirm: () => void;
  loading?: boolean;
  children?: React.ReactNode;
  disabledAvatars?: string[];
}

export default function AppearanceSelector({
  selectedAvatar,
  onSelectAvatar,
  onConfirm,
  loading = false,
  children,
  disabledAvatars = [],
}: Props) {
  const current = selectedAvatar ? AVATARS[selectedAvatar] : null;

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden flex flex-col max-h-[95vh] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] animate-in select-none">
      
      {/* Ambient Tactical Backdrop Glow (bound to current selection) */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700 -top-20 -left-20"
        style={{ backgroundColor: current?.ambientColor || '#3f3f46' }}
      />
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[130px] opacity-20 pointer-events-none transition-all duration-700 -bottom-20 -right-20"
        style={{ backgroundColor: current?.ambientColor || '#3f3f46' }}
      />

      {/* Subtle top glass reflection highlight */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

      <div className="relative z-10 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
        
        {children}

        {/* Header Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium tracking-wider uppercase text-zinc-300 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Player Appearance
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1">
            Choose your character:
          </h1>
        </div>

        {/* The 1x6 Grid of Animal Avatars */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-y-4 gap-x-3 sm:gap-x-4 justify-items-center mb-1">
          {avatarKeys.map((key) => {
            const avatar = AVATARS[key];
            const isSelected = selectedAvatar === key;
            const isDisabled = disabledAvatars.includes(key);

            return (
              <button
                key={key}
                onClick={() => !isDisabled && onSelectAvatar(key)}
                disabled={isDisabled}
                className={`group flex flex-col items-center focus:outline-none transition-all duration-300 ${
                  isDisabled ? "opacity-40 cursor-not-allowed grayscale" : ""
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {/* Glow Anchor */}
                  <div 
                    className={`absolute -inset-1 rounded-full transition-all duration-300 ${avatar.glowColor} ${
                      isSelected && !isDisabled ? "opacity-80 blur-lg animate-pulse-glow" : "opacity-0 blur-md"
                    }`}
                  />
                  
                  {/* Avatar Circle */}
                  <div 
                    className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full relative flex items-center justify-center ${avatar.colorClass} transition-all duration-300 overflow-visible border-[3px] ${
                      isSelected && !isDisabled
                        ? "shadow-xl border-white scale-110 opacity-100"
                        : "shadow border-transparent opacity-65 scale-95"
                    } ${!isDisabled ? "cursor-pointer hover:opacity-90 hover:scale-100" : ""}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/20 pointer-events-none rounded-full"></div>
                    
                    {/* The SVG Image */}
                    <img 
                      src={`/avatars/${key}.svg`} 
                      alt={avatar.name}
                      className={`w-full h-full relative z-10 overflow-visible ${avatar.paddingClass}`}
                    />
                    
                    {/* Taken Badge */}
                    {isDisabled && (
                      <div className="absolute -bottom-1 -right-1 bg-zinc-900 border border-zinc-700 text-zinc-400 text-[9px] px-1.5 py-0.5 rounded-md font-bold z-20 shadow-lg uppercase tracking-wider">
                        Taken
                      </div>
                    )}
                  </div>
                </div>
                <span 
                  className={`mt-2 text-[10px] sm:text-xs tracking-wide transition-colors ${
                    isSelected && !isDisabled ? "font-bold text-white" : "font-medium text-zinc-400 group-hover:text-zinc-200"
                  }`}
                >
                  {avatar.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selection Feedback Status Bar */}
        <div className="h-5 flex items-center justify-center text-[10px] sm:text-xs text-zinc-400 font-mono">
          {current ? (
            <span>
              Selected: <strong className={current.statusColorText}>{current.name}</strong>
            </span>
          ) : (
            <span>Select a character to continue</span>
          )}
        </div>

        {/* Dynamic Action Button: Confirm & Join */}
        <div>
          <button
            onClick={onConfirm}
            disabled={!current || loading}
            className={`group w-full py-3.5 px-6 rounded-full font-semibold text-sm tracking-wide transition-all duration-300 shadow-lg flex items-center justify-center gap-2 ${
              current 
                ? `${current.btnClass} shadow-cyan-500/40 hover:brightness-110 active:scale-[0.98]`
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            }`}
          >
            {loading ? (
              "Joining..."
            ) : (
              <>
                {current ? `Confirm & Join as ${current.name}` : "Confirm & Join"}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
