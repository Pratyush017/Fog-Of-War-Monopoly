"use client";

import { useEffect, useRef } from "react";

export function useGameSounds() {
  const rollAudioRef = useRef<HTMLAudioElement | null>(null);
  const purchaseAudioRef = useRef<HTMLAudioElement | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const jailAudioRef = useRef<HTMLAudioElement | null>(null);
  const fullUpgradeAudioRef = useRef<HTMLAudioElement | null>(null);
  const boughtAllSetsAudioRef = useRef<HTMLAudioElement | null>(null);
  const upgradeDegradeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Only instantiate in browser
    if (typeof window !== "undefined") {
      const initAudio = (path: string, volume: number = 0.4) => {
        const audio = new Audio(path);
        audio.volume = volume;
        audio.load();
        return audio;
      };

      rollAudioRef.current = initAudio("/sounds/dicerollsound.mp3");
      purchaseAudioRef.current = initAudio("/sounds/purchasesound.mp3");
      notificationAudioRef.current = initAudio("/sounds/notification.mp3");
      jailAudioRef.current = initAudio("/sounds/jail.mp3");
      fullUpgradeAudioRef.current = initAudio("/sounds/fullupgrade.mp3");
      boughtAllSetsAudioRef.current = initAudio("/sounds/boughtallsets.mp3");
      upgradeDegradeAudioRef.current = initAudio("/sounds/upgrade_degrade.mp3");
    }
  }, []);

  const playRoll = () => {
    if (rollAudioRef.current) {
      rollAudioRef.current.currentTime = 0;
      rollAudioRef.current.play().catch(console.warn);
    }
  };

  const playPurchase = () => {
    if (purchaseAudioRef.current) {
      purchaseAudioRef.current.currentTime = 0;
      purchaseAudioRef.current.play().catch(console.warn);
    }
  };

  const playNotification = () => {
    if (notificationAudioRef.current) {
      notificationAudioRef.current.currentTime = 0;
      notificationAudioRef.current.play().catch(console.warn);
    }
  };

  const playJail = () => {
    if (jailAudioRef.current) {
      jailAudioRef.current.currentTime = 0;
      jailAudioRef.current.play().catch(console.warn);
    }
  };

  const playFullUpgrade = () => {
    if (fullUpgradeAudioRef.current) {
      fullUpgradeAudioRef.current.currentTime = 0;
      fullUpgradeAudioRef.current.play().catch(console.warn);
    }
  };

  const playBoughtAllSets = () => {
    if (boughtAllSetsAudioRef.current) {
      boughtAllSetsAudioRef.current.currentTime = 0;
      boughtAllSetsAudioRef.current.play().catch(console.warn);
    }
  };

  const playUpgradeDegrade = () => {
    if (upgradeDegradeAudioRef.current) {
      upgradeDegradeAudioRef.current.currentTime = 0;
      upgradeDegradeAudioRef.current.play().catch(console.warn);
    }
  };

  return { playRoll, playPurchase, playNotification, playJail, playFullUpgrade, playBoughtAllSets, playUpgradeDegrade };
}
