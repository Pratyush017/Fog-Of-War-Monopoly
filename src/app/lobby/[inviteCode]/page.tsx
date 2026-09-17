"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { subscribeToMatch, unsubscribeFromMatch, type GameEvent } from "@/lib/supabase-channels";
import { useGameStore } from "@/store/game-store";

interface LobbyPlayer {
  id: string;
  name: string;
  avatar: string | null;
  turnOrder: number;
}

interface MatchSettings {
  startingCash: number;
  mortgageRule: string;
  passUpRule: string;
  evenBuild: boolean;
  gameMode: 'CLASSIC' | 'FOG_OF_WAR';
}

export default function LobbyPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = use(params);
  const router = useRouter();
  
  useEffect(() => {
    useGameStore.getState().resetStore();
  }, []);
  
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [settings, setSettings] = useState<MatchSettings>({
    startingCash: 1500,
    mortgageRule: "ORIGINAL",
    passUpRule: "HIDDEN",
    evenBuild: true,
    gameMode: "FOG_OF_WAR",
  });
  const [matchId, setMatchId] = useState("");
  const [hostId, setHostId] = useState("");
  const [myPlayerId, setMyPlayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isHost = myPlayerId === hostId;

  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/match/${inviteCode}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const match = data.match;
      setMatchId(match.id);
      setHostId(match.hostId);
      setPlayers(match.players);
      setSettings({
        startingCash: match.startingCash,
        mortgageRule: match.mortgageRule,
        passUpRule: match.passUpRule,
        evenBuild: match.evenBuild,
        gameMode: match.gameMode || "FOG_OF_WAR",
      });

      if (match.status === "PLAYING") {
        router.push(`/game/${inviteCode}`);
      }
    } catch (err) {
      setError("Failed to load match");
    } finally {
      setLoading(false);
    }
  }, [inviteCode, router]);

  useEffect(() => {
    const pid = sessionStorage.getItem("playerId");
    if (pid) setMyPlayerId(pid);
    else router.push("/");
    fetchMatch();
  }, [fetchMatch, router]);

  useEffect(() => {
    if (!inviteCode) return;

    const handleEvent = (event: GameEvent) => {
      switch (event.type) {
        case "player-joined":
          setPlayers((prev) => {
            if (prev.find((p) => p.id === event.payload.playerId)) return prev;
            return [
              ...prev,
              {
                id: event.payload.playerId,
                name: event.payload.name,
                avatar: event.payload.avatar ?? null,
                turnOrder: prev.length,
              },
            ];
          });
          break;
        case "settings-updated":
          setSettings(event.payload);
          break;
        case "game-started":
          router.push(`/game/${inviteCode}`);
          break;
      }
    };

    subscribeToMatch(inviteCode, handleEvent);
    return () => unsubscribeFromMatch(inviteCode);
  }, [inviteCode, router]);

  const handleLocalSettingChange = (field: string, value: unknown) => {
    if (!isHost) return;
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const syncSettingToBackend = async (field: string, value: unknown) => {
    if (!isHost) return;

    await fetch("/api/match/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        playerId: myPlayerId,
        [field]: value,
      }),
    });
  };

  const handleStart = async () => {
    if (!isHost) return;
    setStarting(true);

    try {
      const res = await fetch("/api/match/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, hostPlayerId: myPlayerId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setStarting(false);
    }
  };

  const getAvatarImage = (id: string | null) => {
    if (!id) return <span className="text-xl">🎩</span>;
    return <img src={`/avatars/${id}.svg`} alt={id} className="w-6 h-6 drop-shadow-sm" />;
  };

  const getAvatarColor = (id: string | null) => {
    if (!id) return 'bg-[#3b2314] border-[#71482b]';
    const bgColors: Record<string, string> = {
      'cat': 'bg-[#b57948] border-[#693e1b]',
      'fox': 'bg-[#ba543b] border-[#6d2717]',
      'dog': 'bg-[#c9964a] border-[#76511b]',
      'bear': 'bg-[#557252] border-[#2b4129]',
      'bunny': 'bg-[#cbb38b] border-[#796443]',
      'owl': 'bg-[#675276] border-[#382644]',
    };
    return bgColors[id] || 'bg-[#c9964a] border-[#76511b]';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121a24] flex items-center justify-center font-sans">
        <div className="text-xl text-[#e5d8be] animate-pulse">
          Loading lobby...
        </div>
      </div>
    );
  }

  return (
    <main className="flex-grow w-full max-w-6xl mx-auto px-4 py-8 flex flex-col items-center justify-center relative min-h-[100dvh] font-sans selection:bg-amber-800 selection:text-white">
      <section className="w-full flex flex-col items-center transition-all duration-300" id="screen-lobby">
        {/* Header Banner */}
        <div className="deckled-edges parchment-card px-8 py-3 mb-6 shadow-xl border border-[#c5ae81]">
          <h1 className="title-emboss text-2xl sm:text-3xl font-extrabold uppercase tracking-widest text-[#56361a] text-center">
            Fog of War Monopoly
          </h1>
        </div>
        
        {/* Leather Setup Panel */}
        <div className="leather-panel relative rounded-lg w-full max-w-[480px] p-5 sm:p-7 text-[#ecdac0]">
          {/* Brass Corners */}
          <div className="brass-corner-tl"></div>
          <div className="brass-corner-tr"></div>
          <div className="brass-corner-bl"></div>
          <div className="brass-corner-br"></div>
          
          {/* Top Status Bar: Room & Visibility */}
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[#d3be9c] mb-5 border-b border-[#734b2f] pb-3">
            <div 
              className="flex items-center space-x-2 cursor-pointer group hover:bg-[#573922] p-1.5 -ml-1.5 rounded transition-colors" 
              onClick={() => {
                navigator.clipboard.writeText(inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              title="Copy Room Code"
            >
              <span className="text-sm">▦</span>
              <span>Room: <strong className="text-amber-200">#{inviteCode}</strong></span>
              {copied ? (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-[#d3be9c] opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </div>
            <span className="px-2.5 py-0.5 rounded bg-[#492d1a] border border-[#835634] text-[10px] tracking-widest font-sans font-bold text-amber-300">
              Public
            </span>
          </div>
          
          {/* Players Section */}
          <div className="mb-5">
            <div className="flex justify-between items-center text-[11px] font-bold tracking-wider uppercase text-[#c3a47a] mb-2">
              <span>Players ({players.length}/6)</span>
            </div>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="bg-[#f0e2c2] text-[#412913] rounded-md p-2.5 flex items-center justify-between border border-[#e1ce9e] shadow">
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-full ${getAvatarColor(player.avatar)} flex items-center justify-center text-lg shadow-inner border`}>
                      {getAvatarImage(player.avatar)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5 leading-none">
                        <span className="font-bold text-sm text-[#38220f]">{player.name}</span>
                        {player.id === myPlayerId && (
                          <span className="text-[10px] text-[#6d4d29] uppercase font-bold">(You)</span>
                        )}
                      </div>
                      {player.id === hostId && (
                        <div className="text-[10px] font-bold text-amber-800 flex items-center space-x-1 mt-0.5">
                          <span>👑</span>
                          <span className="tracking-widest">HOST</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`w-3.5 h-3.5 rounded-full shadow ${player.id === hostId ? 'bg-amber-500 border-amber-300' : 'bg-gray-400 border-gray-300'}`}></span>
                </div>
              ))}
              
              {/* Empty Slots */}
              {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-[#3b2314]/70 border border-dashed border-[#71482b] rounded-md p-2.5 flex items-center space-x-3 text-[#9a7657]">
                  <div className="w-8 h-8 rounded-full border border-[#5d3b23] flex items-center justify-center font-bold text-xs bg-[#2f1b0e]">
                    ?
                  </div>
                  <span className="text-xs italic tracking-wide">Waiting for player...</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Starting Cash Slider Control */}
          <div className="mb-5 bg-[#4c2f1b] p-3 rounded border border-[#6b4427]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d3b690]">Starting Cash</span>
              <span className="text-sm font-bold text-amber-200">
                ${settings.startingCash.toLocaleString()} <span className="text-[10px] font-normal text-amber-400">USD</span>
              </span>
            </div>
            {isHost ? (
              <input 
                type="range" 
                className="w-full cursor-pointer my-1" 
                min="500" 
                max="3000" 
                step="250" 
                value={settings.startingCash}
                onChange={(e) => handleLocalSettingChange("startingCash", parseInt(e.target.value))}
                onPointerUp={(e) => syncSettingToBackend("startingCash", parseInt((e.target as HTMLInputElement).value))}
              />
            ) : (
              <div className="h-4 my-1"></div>
            )}
            <div className="flex justify-between text-[10px] text-[#a4825d] font-mono">
              <span>$500</span>
              <span>$1,750</span>
              <span>$3,000</span>
            </div>
          </div>
          
          {/* Game Mode Dropdown */}
          <div className="mb-5 bg-[#4c2f1b] p-3 rounded border border-[#6b4427]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#d3b690]">Game Mode</span>
            </div>
            {isHost ? (
              <select 
                className="w-full bg-[#3a2212] border border-[#5a381e] text-[#e0c7a5] text-sm rounded p-2 outline-none font-semibold focus:border-[#c3a47a] transition-colors"
                value={settings.gameMode}
                onChange={(e) => {
                  const newVal = e.target.value as 'CLASSIC' | 'FOG_OF_WAR';
                  if (newVal === 'CLASSIC' || newVal === 'FOG_OF_WAR') {
                    handleLocalSettingChange("gameMode", newVal);
                    syncSettingToBackend("gameMode", newVal);
                  }
                }}
              >
                <option value="CLASSIC">Classic Monopoly</option>
                <option value="FOG_OF_WAR">Fog of War (Blind Properties)</option>
                <option value="COMING_SOON" disabled>Coming Soon...</option>
              </select>
            ) : (
              <div className="w-full bg-[#3a2212] border border-[#5a381e] text-[#e0c7a5] text-sm rounded p-2 font-semibold">
                {settings.gameMode === "CLASSIC" ? "Classic Monopoly" : "Fog of War (Blind Properties)"}
              </div>
            )}
          </div>
          
          {/* Rules Toggles */}
          <div className="space-y-2 mb-6">
            {/* Mortgage Rule Toggle */}
            <div className="bg-[#f2e5c8] text-[#412c17] rounded p-2.5 flex items-center justify-between border border-[#ddcaa2] shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#35210f]">Mortgage Rule</div>
                <div className="text-[11px] text-[#694e32]">
                  {settings.mortgageRule === "ORIGINAL" ? "Original 50% Equity" : "Flat $100"}
                </div>
              </div>
              {isHost ? (
                <button 
                  className={`w-12 h-6 rounded-full p-0.5 border transition-colors relative flex items-center ${settings.mortgageRule === "FLAT_100" ? "bg-[#492e1b] border-[#684126]" : "bg-gray-600 border-gray-700"}`}
                  onClick={() => {
                    const newVal = settings.mortgageRule === "ORIGINAL" ? "FLAT_100" : "ORIGINAL";
                    handleLocalSettingChange("mortgageRule", newVal);
                    syncSettingToBackend("mortgageRule", newVal);
                  }}
                >
                  <span className={`w-5 h-5 rounded-full bg-[#ecd5a8] shadow-md transform transition-transform ${settings.mortgageRule === "FLAT_100" ? "translate-x-6" : "translate-x-0.5"}`}></span>
                </button>
              ) : (
                <div className="text-xs font-bold text-[#694e32]">{settings.mortgageRule}</div>
              )}
            </div>
            
            {/* Pass-Up Rule Toggle */}
            <div className="bg-[#f2e5c8] text-[#412c17] rounded p-2.5 flex items-center justify-between border border-[#ddcaa2] shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#35210f]">Pass-Up Rule</div>
                <div className="text-[11px] text-[#694e32]">
                  {settings.passUpRule === "HIDDEN" ? "Stays hidden" : "Force Auction"}
                </div>
              </div>
              {isHost ? (
                <button 
                  className={`w-12 h-6 rounded-full p-0.5 border transition-colors relative flex items-center ${settings.passUpRule === "AUCTION" ? "bg-[#492e1b] border-[#684126]" : "bg-gray-600 border-gray-700"}`}
                  onClick={() => {
                    const newVal = settings.passUpRule === "HIDDEN" ? "AUCTION" : "HIDDEN";
                    handleLocalSettingChange("passUpRule", newVal);
                    syncSettingToBackend("passUpRule", newVal);
                  }}
                >
                  <span className={`w-5 h-5 rounded-full bg-[#ecd5a8] shadow-md transform transition-transform ${settings.passUpRule === "AUCTION" ? "translate-x-6" : "translate-x-0.5"}`}></span>
                </button>
              ) : (
                <div className="text-xs font-bold text-[#694e32]">{settings.passUpRule}</div>
              )}
            </div>
            
            {/* Even Build Rule Toggle */}
            <div className="bg-[#f2e5c8] text-[#412c17] rounded p-2.5 flex items-center justify-between border border-[#ddcaa2] shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#35210f]">Even Build Rule</div>
                <div className="text-[11px] text-[#694e32]">
                  {settings.evenBuild ? "Enabled (Default)" : "Disabled (Build Anywhere)"}
                </div>
              </div>
              {isHost ? (
                <button 
                  className={`w-12 h-6 rounded-full p-0.5 border transition-colors relative flex items-center ${settings.evenBuild ? "bg-[#492e1b] border-[#684126]" : "bg-gray-600 border-gray-700"}`}
                  onClick={() => {
                    const newVal = !settings.evenBuild;
                    handleLocalSettingChange("evenBuild", newVal);
                    syncSettingToBackend("evenBuild", newVal);
                  }}
                >
                  <span className={`w-5 h-5 rounded-full bg-[#ecd5a8] shadow-md transform transition-transform ${settings.evenBuild ? "translate-x-6" : "translate-x-0.5"}`}></span>
                </button>
              ) : (
                <div className="text-xs font-bold text-[#694e32]">{settings.evenBuild ? "Enabled" : "Disabled"}</div>
              )}
            </div>
          </div>
          
          {error && <p className="text-red-400 text-sm font-bold text-center mb-4">{error}</p>}
          
          {/* START GAME Button */}
          {isHost ? (
            <button 
              onClick={handleStart}
              disabled={starting}
              className="btn-terracotta w-full py-3.5 px-4 rounded-md text-white font-bold tracking-widest text-base uppercase transition disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start Game"}
            </button>
          ) : (
            <div className="w-full py-3.5 px-4 rounded-md text-center text-[#d3be9c] bg-[#3a2211] border border-[#523219] font-bold tracking-widest text-sm uppercase">
              Waiting for host...
            </div>
          )}
        </div>
      </section>
      
    </main>
  );
}
