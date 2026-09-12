import { type ClassValue, clsx } from 'clsx';
import { Room } from 'livekit-client';
import { twMerge } from 'tailwind-merge';
import type { ReceivedChatMessage, TextStreamData } from '@livekit/components-react';

/**
 * Merge Tailwind class names, deduping conflicting utilities. Used across
 * every shared UI primitive (Button, Alert, Toggle, etc.).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a LiveKit TextStreamData transcript entry into the ReceivedChatMessage
 * shape the AiSCENT chat surface expects. Falls back to `undefined` for
 * `from` if the remote participant can't be resolved on the room.
 */
export function transcriptionToChatMessage(
  textStream: TextStreamData,
  room: Room
): ReceivedChatMessage {
  return {
    id: textStream.streamInfo.id,
    timestamp: textStream.streamInfo.timestamp,
    message: textStream.text,
    from:
      textStream.participantInfo.identity === room.localParticipant.identity
        ? room.localParticipant
        : Array.from(room.remoteParticipants.values()).find(
            (p) => p.identity === textStream.participantInfo.identity
          ),
  };
}
