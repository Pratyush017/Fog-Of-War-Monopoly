"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AVATARS } from "@/components/AppearanceSelector";

const avatarKeys = Object.keys(AVATARS);

export default function LandingPage() {
  const router = useRouter();
  const [view, setView] = useState<"main" | "invite" | "character">("main");
  const [playerName, setPlayerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>("dog");
  const [takenAvatars, setTakenAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [error, setError] = useState("");
  const [isJoinFlow, setIsJoinFlow] = useState(false);

  const handleCreateFlow = () => {
    setIsJoinFlow(false);
    setView("character");
  };

  const handleJoinFlow = () => {
    setIsJoinFlow(true);
    setView("invite");
  };

  const handleNextJoin = async () => {
    if (!inviteCode.trim()) {
      setError("Enter invite code");
      return;
    }
    setValidatingCode(true);
    setError("");

    try {
      const res = await fetch(`/api/match/${inviteCode.toUpperCase()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Match not found");

      const avatars = data.match.players.map((p: any) => p.avatar).filter(Boolean);
      setTakenAvatars(avatars);
      setView("character");
    } catch (err: any) {
      setError(err.message || "Match not found");
    } finally {
      setValidatingCode(false);
    }
  };

  const handleConfirmAndJoin = async () => {
    if (!playerName.trim()) {
      setError("Enter your name");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const avatarData = selectedAvatar ? AVATARS[selectedAvatar] : AVATARS["dog"];
      
      let res;
      if (isJoinFlow) {
        res = await fetch("/api/match/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteCode: inviteCode.trim().toUpperCase(),
            playerName: playerName.trim(),
            color: avatarData.hexColor,
            avatar: avatarData.id,
          }),
        });
      } else {
        res = await fetch("/api/match/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            playerName: playerName.trim(), 
            color: avatarData.hexColor, 
            avatar: avatarData.id 
          }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join/create match");
      }

      const data = await res.json();
      sessionStorage.setItem("playerId", data.playerId);
      sessionStorage.setItem("playerName", data.playerName);
      router.push(`/lobby/${data.inviteCode}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getAvatarImage = (id: string) => {
    return <img src={`/avatars/${id}.svg`} alt={id} className="w-8 h-8 drop-shadow-sm" />;
  };

  return (
    <div className="w-full min-h-[100dvh] md:bg-[url('/screen2.png')] bg-cover bg-center bg-no-repeat">
      <main className="flex-grow w-full max-w-6xl mx-auto px-4 py-8 flex flex-col items-center justify-center relative min-h-[100dvh] font-sans selection:bg-amber-800 selection:text-white">
      
      {/* SCREEN 1: MAIN MENU */}
      {view === "main" && (
        <section className="w-full flex-col items-center transition-all duration-300 flex md:mt-32" id="screen-main">
          <div className="text-center mb-8 md:hidden">
            <h1 className="title-emboss text-3xl sm:text-5xl font-extrabold uppercase leading-tight tracking-wider">
              Fog of War<br />Monopoly
            </h1>
          </div>
          
          <div className="deckled-edges parchment-card w-full max-w-[490px] rounded-sm p-6 sm:p-9 text-[#422c16]">
            <div className="space-y-4 mb-8">
              <button 
                onClick={handleCreateFlow}
                className="btn-terracotta w-full py-3.5 px-6 rounded-lg text-white font-bold tracking-wider text-base sm:text-lg flex items-center justify-center uppercase transition"
              >
                Create Match
              </button>
              <button 
                onClick={handleJoinFlow}
                className="btn-dark-slate w-full py-3.5 px-6 rounded-lg text-white font-bold tracking-wider text-base sm:text-lg flex items-center justify-center uppercase transition"
              >
                Join Match
              </button>
            </div>
            
            <div className="border-t border-[#ceba94] pt-5 text-center">
              <div className="text-[11px] font-bold tracking-widest text-[#7c5b36] uppercase mb-3">
                How It Works
              </div>
              <div className="space-y-1.5 text-xs sm:text-[13px] leading-relaxed text-[#513b24]">
                <p><strong className="font-bold text-[#35200f]">Blind Buy:</strong> Properties are hidden until purchased.</p>
                <p><strong className="font-bold text-[#35200f]">Chaos Shuffle:</strong> Bankruptcy scrambles the board.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SCREEN 2: INVITE CODE */}
      {view === "invite" && (
        <section className="w-full flex-col items-center transition-all duration-300 flex md:mt-32" id="screen-invite">
          <div className="text-center mb-8 md:hidden">
            <h1 className="title-emboss text-3xl sm:text-5xl font-extrabold uppercase leading-tight tracking-wider">
              Fog of War<br />Monopoly
            </h1>
          </div>
          
          <div className="relative bg-[#f1e3c5] border-4 border-[#52341d] rounded shadow-2xl w-full max-w-[500px] p-6 sm:p-8 text-[#4a3420]">
            <div className="brass-corner-tl"></div>
            <div className="brass-corner-tr"></div>
            <div className="brass-corner-bl"></div>
            <div className="brass-corner-br"></div>
            
            <button 
              onClick={() => { setView("main"); setError(""); }}
              className="text-xs font-bold uppercase tracking-wider text-[#694828] hover:text-black mb-5 inline-flex items-center transition"
            >
              ← Back
            </button>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#6d4c2b] mb-2" htmlFor="invite-code-input">
                  Invite Code
                </label>
                <div className="relative bg-[#ebd8b1] border-2 border-[#b5986e] rounded p-2 shadow-inner">
                  <input 
                    id="invite-code-input"
                    type="text" 
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full bg-transparent border-none text-center font-mono font-bold text-xl sm:text-2xl tracking-[0.25em] text-[#4a331c] focus:ring-0 focus:outline-none" 
                    maxLength={6}
                  />
                </div>
                {error && <p className="text-red-700 font-bold mt-2 text-sm">{error}</p>}
              </div>
              
              <button 
                onClick={handleNextJoin}
                disabled={validatingCode || !inviteCode.trim()}
                className="btn-wood-gold w-full py-3.5 px-6 rounded text-white font-bold tracking-widest text-sm sm:text-base flex items-center justify-center uppercase transition disabled:opacity-50"
              >
                {validatingCode ? "Checking..." : "Next →"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SCREEN 3: CHARACTER SELECT */}
      {view === "character" && (
        <section className="w-full flex-col items-center transition-all duration-300 flex md:mt-32" id="screen-character">
          <div className="text-center mb-6 md:hidden">
            <h1 className="title-emboss text-3xl sm:text-5xl font-extrabold uppercase leading-tight tracking-wider">
              Fog of War<br />Monopoly
            </h1>
          </div>
          
          <div className="deckled-edges parchment-card w-full max-w-[620px] rounded-sm p-6 sm:p-8 text-[#4a3420]">
            <button 
              onClick={() => { setView(isJoinFlow ? "invite" : "main"); setError(""); }}
              className="text-xs font-bold uppercase tracking-wider text-[#6c4c2a] hover:text-black mb-4 inline-flex items-center transition"
            >
              ← Back
            </button>
            
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6e4c2b] mb-1.5" htmlFor="player-name-input">
                Your Name
              </label>
              <input 
                id="player-name-input"
                type="text" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-[#ebd7af]/80 border border-[#bfa67c] rounded-md px-3.5 py-2.5 text-sm text-[#46311d] placeholder-[#8d7554] shadow-inner focus:outline-none focus:border-amber-700"
                maxLength={20}
              />
              {error && <p className="text-red-700 font-bold mt-1 text-sm">{error}</p>}
            </div>
            
            <div className="text-center my-4">
              <span className="inline-block px-4 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase text-[#fbebd0] bg-[#674426] border border-[#8b613c] shadow-sm">
                • Player Appearance
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#3d2915] mt-2">
                Choose your character:
              </h2>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-2 my-5 text-center">
              {avatarKeys.map((key) => {
                const avatar = AVATARS[key];
                const isSelected = selectedAvatar === key;
                const isDisabled = takenAvatars.includes(key);
                
                // We map avatar names to the colors from the HTML design for the tactile wood tokens
                const bgColors: Record<string, string> = {
                  'cat': 'bg-[#b57948]',
                  'fox': 'bg-[#ba543b]',
                  'dog': 'bg-[#c9964a]',
                  'bear': 'bg-[#557252]',
                  'bunny': 'bg-[#cbb38b]',
                  'owl': 'bg-[#675276]',
                };
                
                const borderColors: Record<string, string> = {
                  'cat': 'border-[#693e1b]',
                  'fox': 'border-[#6d2717]',
                  'dog': 'border-[#76511b]',
                  'bear': 'border-[#2b4129]',
                  'bunny': 'border-[#796443]',
                  'owl': 'border-[#382644]',
                };

                return (
                  <div 
                    key={key}
                    onClick={() => !isDisabled && setSelectedAvatar(key)}
                    className={`flex flex-col items-center group transition-all duration-300 ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                  >
                    <div className={`token-wood w-14 h-14 rounded-full ${bgColors[key]} border-2 ${borderColors[key]} flex items-center justify-center text-2xl relative ${isSelected ? 'selected' : ''}`}>
                      {getAvatarImage(key)}
                      {isDisabled && (
                        <div className="absolute -bottom-1 -right-1 bg-zinc-900 border border-zinc-700 text-zinc-400 text-[9px] px-1.5 py-0.5 rounded-md font-bold z-20 shadow-lg uppercase tracking-wider">
                          Taken
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-semibold mt-1.5 ${isSelected ? 'text-black' : 'text-[#4e341b]'}`}>{avatar.name}</span>
                  </div>
                );
              })}
            </div>
            
            <p className="text-center text-xs text-[#7a5937] italic mb-4">
              Selected: <strong className="not-italic text-[#462e17]">{selectedAvatar ? AVATARS[selectedAvatar].name : 'None'}</strong>
            </p>
            
            <button 
              onClick={handleConfirmAndJoin}
              disabled={loading || !selectedAvatar}
              className="btn-wood-gold w-full py-3.5 px-6 rounded text-white font-bold tracking-wider text-sm sm:text-base flex items-center justify-center uppercase transition disabled:opacity-50"
            >
              {loading ? "Joining..." : "Confirm & Join →"}
            </button>
          </div>
        </section>
      )}

    </main>
  );
}
