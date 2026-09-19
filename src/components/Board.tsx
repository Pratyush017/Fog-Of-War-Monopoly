"use client";

import { useRef, useEffect, useState } from "react";
import { useGameStore } from "@/store/game-store";
import { boardIndexToGridPosition } from "@/lib/game-engine";
import Tile from "./Tile";
import TokenLayer from "./TokenLayer";
import DiceRoller from "./DiceRoller";
import ActionPanel from "./ActionPanel";
import PlayerHUD from "./PlayerHUD";
import ActionCardReveal from "./ActionCardReveal";
import PropertyStatWindow from "./PropertyStatWindow";

// Map board index to grid area (CSS grid row/col)
function getTileGridStyle(boardIndex: number): React.CSSProperties {
  const { row, col } = boardIndexToGridPosition(boardIndex);
  return {
    gridRow: row,
    gridColumn: col,
  };
}

export default function Board() {
  const boardRef = useRef<HTMLDivElement>(null);
  const tiles = useGameStore((s) => s.tiles);
  const setTileCoordinates = useGameStore((s) => s.setTileCoordinates);

  const [scale, setScale] = useState(1);
  const [isDesktop, setIsDesktop] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort tiles by board index for consistent rendering
  const sortedTiles = [...tiles].sort((a, b) => a.boardIndex - b.boardIndex);

  // Measure tile coordinates and dispatch to store
  useEffect(() => {
    const updateCoords = () => {
      if (!boardRef.current) return;
      const board = boardRef.current;
      const boardRect = board.getBoundingClientRect();
      const coords: Record<number, { x: number; y: number }> = {};

      const cells = board.querySelectorAll("[data-board-index]");
      cells.forEach((cell) => {
        const index = parseInt(cell.getAttribute("data-board-index") || "-1", 10);
        if (index >= 0) {
          const rect = cell.getBoundingClientRect();
          // Calculate center point relative to the board
          coords[index] = {
            x: rect.left - boardRect.left + rect.width / 2,
            y: rect.top - boardRect.top + rect.height / 2,
          };
        }
      });
      setTileCoordinates(coords);
    };

    // Use ResizeObserver to automatically update on resize
    const observer = new ResizeObserver(updateCoords);
    if (boardRef.current) {
      observer.observe(boardRef.current);
    }
    
    // Initial measurement
    updateCoords();

    return () => observer.disconnect();
  }, [setTileCoordinates, sortedTiles.length]); // Re-run if tiles array changes (e.g. initial load)

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { width, height } = entries[0].contentRect;
      
      const availableWidth = width;
      const availableHeight = height;
      const minDimension = Math.min(availableWidth, availableHeight);
      
      if (minDimension < 760) {
        setScale(minDimension / 760);
      } else {
        setScale(1);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return (
    <main className="w-full max-w-[1380px] h-[100dvh] flex flex-col lg:flex-row gap-5 items-stretch justify-center mx-auto p-1 sm:p-3 md:p-6 overflow-hidden relative" data-purpose="game-wrapper">
      
      {/* LEFT / CENTER AREA: 11x11 Grid Board */}
      <section 
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden flex flex-col items-center justify-start lg:justify-center p-2 pb-24 lg:pb-4 rounded-xl relative shadow-2xl min-h-0" 
        data-purpose="monopoly-board-container" 
        style={{ background: "#17212c", border: "4px solid #3d2f21", boxShadow: "0 20px 45px rgba(0,0,0,0.85)" }}
      >
        {/* Brass Corner Ornaments for authentic tabletop feel */}
        <div className="absolute top-1 left-1 w-5 h-5 border-t-2 border-l-2 border-[#b59556] pointer-events-none z-20"></div>
        <div className="absolute top-1 right-1 w-5 h-5 border-t-2 border-r-2 border-[#b59556] pointer-events-none z-20"></div>
        <div className="absolute bottom-1 left-1 w-5 h-5 border-b-2 border-l-2 border-[#b59556] pointer-events-none z-20"></div>
        <div className="absolute bottom-1 right-1 w-5 h-5 border-b-2 border-r-2 border-[#b59556] pointer-events-none z-20"></div>
        
        <div 
          className={isDesktop ? "relative flex-1 flex items-center justify-center w-full h-full" : "relative m-auto"}
          style={isDesktop ? {} : { 
            width: `${760 * scale}px`, 
            height: `${760 * scale}px`,
            marginTop: scale < 1 ? 'auto' : undefined,
            marginBottom: scale < 1 ? 'auto' : undefined
          }}
        >
          {/* Main Board Container: 11x11 CSS Grid */}
          <div 
            ref={boardRef}
            id="monopoly-board"
            className={`grid grid-cols-11 grid-rows-11 gap-[2px] bg-[#22180d] p-1 rounded-sm border-2 border-[#54402a] shadow-inner select-none ${isDesktop ? 'relative shrink-0' : 'origin-top-left absolute top-0 left-0'}`}
            style={isDesktop ? { width: "760px", maxWidth: "100%", maxHeight: "100%", aspectRatio: "1/1" } : { 
              width: "760px",
              height: "760px",
              transform: `scale(${scale})`
            }}
          >
            {/* Render all 40 tiles */}
          {sortedTiles.map((tile) => (
            <div
              key={tile.id || tile.boardIndex}
              style={getTileGridStyle(tile.boardIndex)}
              className="w-full h-full"
              data-board-index={tile.boardIndex}
            >
              <Tile
                tile={tile}
                isCorner={[0, 10, 20, 30].includes(tile.boardIndex)}
              />
            </div>
          ))}

          {/* Center Console Area (Board Inner Felt Arena) */}
          <div
            style={{
              gridRow: "2 / 11",
              gridColumn: "2 / 11",
              boxShadow: "inset 0 0 45px rgba(0, 0, 0, 0.95), inset 0 0 10px rgba(0,0,0,0.8)"
            }}
            className="bg-[#17212b] rounded-sm shadow-inner flex flex-col items-center justify-center relative p-4" 
          >
            <div className="pointer-events-auto flex flex-col items-center justify-center w-full h-full z-10 gap-6">
              <PropertyStatWindow />
              <DiceRoller />
              <ActionPanel />
            </div>
          </div>

          {/* Token Layer Overlay */}
          <TokenLayer />
        </div>
        </div>
      </section>

      {/* RIGHT SIDEBAR / MOBILE BOTTOM HUD: Players & HUD */}
      <PlayerHUD />
      
      {/* Global Overlays */}
      <ActionCardReveal />
    </main>
  );
}
