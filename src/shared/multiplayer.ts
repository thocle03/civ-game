import type { GameState, TechType, UnitType, BuildingType } from '../game/GameTypes';
import type { CivKey } from '../game/Civilizations';

export type RoomCode = string;

export type RevealMode = 'FOG' | 'ALL';

export type LobbyPlayer = {
  id: string; // socket id
  name: string;
  playerIndex: number;
  isHost: boolean;
  connected: boolean;
  civChoice?: CivKey | null; // null = aléatoire
};

export type HostSettings = {
  revealMode: RevealMode;
  aiCount: number;
  aiCivChoices: Array<CivKey | null>; // length >= aiCount
};

export type GameAction =
  | { type: 'END_TURN' }
  | { type: 'MOVE_UNIT'; unitId: string; q: number; r: number }
  | { type: 'RANGED_ATTACK'; unitId: string; q: number; r: number }
  | { type: 'FOUND_CITY'; unitId: string }
  | { type: 'SET_RESEARCH'; tech: TechType }
  | { type: 'ENQUEUE_PRODUCTION'; cityId: string; itemType: 'UNIT' | 'BUILDING' | 'WONDER'; itemId: string }
  | { type: 'IMPROVE_TILE'; unitId: string; improvement: string }
  | { type: 'SET_AUTOMATION'; unitId: string; mode: 'EXPLORE' | 'IMPROVE' | null }
  | { type: 'SKIP_UNIT'; unitId: string };

export type ClientToServerEvents = {
  hello: (payload: { name: string }) => void;
  createRoom: () => void;
  joinRoom: (payload: { code: RoomCode }) => void;
  leaveRoom: () => void;
  startGame: () => void;
  updateHostSettings: (payload: HostSettings) => void;
  setCivChoice: (payload: { civChoice: CivKey | null }) => void;
  action: (payload: { action: GameAction }) => void;
};

export type ServerToClientEvents = {
  errorMsg: (payload: { message: string }) => void;
  roomJoined: (payload: { code: RoomCode; you: LobbyPlayer; players: LobbyPlayer[]; hostId: string; hostSettings: HostSettings }) => void;
  roomUpdated: (payload: { code: RoomCode; players: LobbyPlayer[]; hostId: string; hostSettings: HostSettings }) => void;
  gameStarted: (payload: { state: GameState; hostSettings: HostSettings }) => void;
  gameState: (payload: { state: GameState }) => void;
};

export function sanitizePlayerName(name: string) {
  const cleaned = name.trim().slice(0, 18);
  return cleaned.length ? cleaned : 'Player';
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

