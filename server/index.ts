import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

import type { GameState, TechType } from '../src/game/GameTypes';
import { initializeGame, endTurn, moveUnit, foundCity, setResearch, enqueueProduction, improveTile, rangedAttack } from '../src/game/GameCore';
import { UNIT_DEFS } from '../src/game/DataDefs';
import { makeRoomCode, sanitizePlayerName } from '../src/shared/multiplayer';
import type { ClientToServerEvents, ServerToClientEvents, LobbyPlayer, GameAction, RoomCode, HostSettings } from '../src/shared/multiplayer';
import { randomCivKey, type CivKey } from '../src/game/Civilizations';

type Room = {
  code: RoomCode;
  hostId: string;
  players: LobbyPlayer[];
  state: GameState | null;
  hostSettings: HostSettings;
};

const rooms = new Map<RoomCode, Room>();
const socketToRoom = new Map<string, RoomCode>();
const socketNames = new Map<string, string>();

function getRoomOf(socketId: string) {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  return rooms.get(code) ?? null;
}

function broadcastRoom(room: Room, io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.to(room.code).emit('roomUpdated', { code: room.code, players: room.players, hostId: room.hostId, hostSettings: room.hostSettings });
}

function ensureHost(room: Room, io: Server<ClientToServerEvents, ServerToClientEvents>) {
  if (room.players.some(p => p.id === room.hostId && p.connected)) return;
  const next = room.players.find(p => p.connected);
  if (!next) return;
  room.hostId = next.id;
  room.players = room.players.map(p => ({ ...p, isHost: p.id === room.hostId }));
  broadcastRoom(room, io);
}

function applyAction(room: Room, actorSocketId: string, action: GameAction): { ok: true; state: GameState } | { ok: false; error: string } {
  if (!room.state) return { ok: false, error: 'Game not started.' };
  const state = room.state;

  const actor = room.players.find(p => p.id === actorSocketId);
  if (!actor) return { ok: false, error: 'You are not in this room.' };
  const actorPid = actor.playerIndex;

  // Turn validation: only the active player can issue game-changing actions.
  if (state.currentPlayerIndex !== actorPid) return { ok: false, error: 'Not your turn.' };

  let next: GameState = state;
  try {
    switch (action.type) {
      case 'END_TURN':
        next = endTurn(state);
        break;
      case 'MOVE_UNIT':
        next = moveUnit(state, action.unitId, action.q, action.r);
        break;
      case 'RANGED_ATTACK':
        next = rangedAttack(state, action.unitId, action.q, action.r);
        break;
      case 'FOUND_CITY':
        next = foundCity(state, action.unitId);
        break;
      case 'SET_RESEARCH':
        next = setResearch(state, actorPid, action.tech as TechType);
        break;
      case 'ENQUEUE_PRODUCTION':
        next = enqueueProduction(state, action.cityId, action.itemType, action.itemId);
        break;
      case 'IMPROVE_TILE':
        next = improveTile(state, action.unitId, action.improvement);
        break;
      case 'SET_AUTOMATION': {
        const u = state.units[action.unitId];
        if (!u) break;
        if (u.ownerId !== actorPid) break;
        next = {
          ...state,
          units: {
            ...state.units,
            [action.unitId]: { ...u, automation: action.mode }
          }
        };
        break;
      }
      case 'SKIP_UNIT': {
        const u = state.units[action.unitId];
        if (!u) break;
        if (u.ownerId !== actorPid) break;
        next = {
          ...state,
          units: {
            ...state.units,
            [action.unitId]: { ...u, movement: 0, actionsDone: true }
          }
        };
        break;
      }
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed.' };
  }

  // Basic protection: prevent no-op spam
  if (next === state) return { ok: false, error: 'Illegal or no-op action.' };

  return { ok: true, state: next };
}

function buildMultiplayerState(roomPlayers: LobbyPlayer[], hostSettings: HostSettings) {
  const sortedHumans = [...roomPlayers].sort((a, b) => a.playerIndex - b.playerIndex);
  const humanCount = sortedHumans.length;
  const aiCount = Math.max(0, Math.floor(hostSettings.aiCount ?? 0));
  const totalPlayers = humanCount + aiCount;

  const civKeys: CivKey[] = [];
  for (let i = 0; i < humanCount; i++) {
    civKeys[i] = sortedHumans[i].civChoice ?? randomCivKey();
  }
  for (let j = 0; j < aiCount; j++) {
    civKeys[humanCount + j] = (hostSettings.aiCivChoices?.[j] ?? null) ?? randomCivKey();
  }

  // initializeGame créera déjà les bonus de civilisation via civKeys
  const state = initializeGame(totalPlayers, civKeys as any);
  const players = { ...state.players };

  for (let i = 0; i < humanCount; i++) {
    players[i] = {
      ...players[i],
      name: sortedHumans[i].name,
      isAI: false,
    };
  }

  for (let i = humanCount; i < totalPlayers; i++) {
    const aiSlot = i - humanCount + 1;
    players[i] = {
      ...players[i],
      name: `AI ${aiSlot}`,
      isAI: true,
    };
  }

  // Remove barbarians from turn order for MP
  delete (players as any)[-1];
  return { ...state, players, currentPlayerIndex: 0 };
}

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: true, credentials: true },
});

io.on('connection', (socket) => {
  // eslint-disable-next-line no-console
  console.log(`[civ-server] client connected ${socket.id}`);
  socket.on('hello', ({ name }) => {
    socketNames.set(socket.id, sanitizePlayerName(name));
  });

  socket.on('createRoom', () => {
    // eslint-disable-next-line no-console
    console.log(`[civ-server] createRoom from ${socket.id}`);
    const name = sanitizePlayerName(socketNames.get(socket.id) ?? 'Host');
    let code = makeRoomCode();
    while (rooms.has(code)) code = makeRoomCode();

    const player: LobbyPlayer = {
      id: socket.id,
      name,
      playerIndex: 0,
      isHost: true,
      connected: true,
      civChoice: null,
    };

    const defaultSettings: HostSettings = {
      revealMode: 'FOG',
      aiCount: 0,
      aiCivChoices: [],
    };

    const room: Room = { code, hostId: socket.id, players: [player], state: null, hostSettings: defaultSettings };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    socket.emit('roomJoined', { code, you: player, players: room.players, hostId: room.hostId, hostSettings: room.hostSettings });
  });

  socket.on('joinRoom', ({ code }) => {
    // eslint-disable-next-line no-console
    console.log(`[civ-server] joinRoom ${code} from ${socket.id}`);
    const room = rooms.get(code);
    if (!room) {
      socket.emit('errorMsg', { message: 'Room not found.' });
      return;
    }
    if (room.state) {
      socket.emit('errorMsg', { message: 'Game already started.' });
      return;
    }

    const name = sanitizePlayerName(socketNames.get(socket.id) ?? 'Player');
    const playerIndex = room.players.length;
    const player: LobbyPlayer = { id: socket.id, name, playerIndex, isHost: false, connected: true, civChoice: null };
    room.players.push(player);

    socketToRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('roomJoined', { code, you: player, players: room.players, hostId: room.hostId, hostSettings: room.hostSettings });
    broadcastRoom(room, io);
  });

  socket.on('leaveRoom', () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const code = room.code;

    room.players = room.players.map(p => p.id === socket.id ? { ...p, connected: false } : p);
    socket.leave(code);
    socketToRoom.delete(socket.id);
    ensureHost(room, io);
    broadcastRoom(room, io);
  });

  socket.on('startGame', () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('errorMsg', { message: 'Only the host can start.' });
      return;
    }
    if (room.state) return;
    if (room.players.length < 2) {
      socket.emit('errorMsg', { message: 'Need at least 2 players.' });
      return;
    }
    room.state = buildMultiplayerState(room.players, room.hostSettings);
    // eslint-disable-next-line no-console
    console.log(`[civ-server] gameStarted in room ${room.code}`);
    io.to(room.code).emit('gameStarted', { state: room.state, hostSettings: room.hostSettings });
  });

  socket.on('action', ({ action }) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const res = applyAction(room, socket.id, action);
    if (!res.ok) {
      const message = 'error' in res ? res.error : 'Action rejected.';
      socket.emit('errorMsg', { message });
      // eslint-disable-next-line no-console
      console.warn(`[civ-server] rejected action from ${socket.id} in room ${room.code}: ${message}`);
      return;
    }
    room.state = res.state;
    io.to(room.code).emit('gameState', { state: room.state });
  });

  socket.on('updateHostSettings', (settings) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('errorMsg', { message: 'Only host can change settings.' });
      return;
    }
    room.hostSettings = settings;
    broadcastRoom(room, io);
  });

  socket.on('setCivChoice', ({ civChoice }) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const p = room.players.find(pl => pl.id === socket.id);
    if (!p) return;
    p.civChoice = civChoice;
    broadcastRoom(room, io);
  });

  socket.on('disconnect', () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    room.players = room.players.map(p => p.id === socket.id ? { ...p, connected: false } : p);
    socketToRoom.delete(socket.id);
    ensureHost(room, io);
    broadcastRoom(room, io);
  });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[civ-server] listening on :${PORT}`);
});

