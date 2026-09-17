import { prisma } from "./prisma";
import { serverBroadcast } from "./supabase-channels";

export async function logGameEvent(
  matchId: string,
  inviteCode: string,
  message: string,
  type: string = "system"
) {
  try {
    const log = await prisma.gameLog.create({
      data: {
        matchId,
        message,
        type,
      },
    });

    // Broadcast the new log to all connected clients
    await serverBroadcast(inviteCode, {
      type: "new-log",
      payload: log,
    });

    return log;
  } catch (error) {
    console.error("Failed to log game event:", error);
  }
}
