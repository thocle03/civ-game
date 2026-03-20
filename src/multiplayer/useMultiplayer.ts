import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import type { GameState } from '../game/GameTypes';
import type { ClientToServerEvents, ServerToClientEvents, GameAction, LobbyPlayer, RoomCode, HostSettings } from '../shared/multiplayer';

type Phase = 'disconnected' | 'connecting' | 'lobby' | 'inGame';

export function useMultiplayer() {
  const [phase, setPhase] = useState<Phase>('disconnected');
  const [serverUrl, setServerUrl] = useState<string>(() => localStorage.getItem('civ_serverUrl') || 'http://localhost:3001');
  const [name, setName] = useState<string>(() => localStorage.getItem('civ_name') || 'Player');
  const [code, setCode] = useState<RoomCode | null>(null);
  const [you, setYou] = useState<LobbyPlayer | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostSettings, setHostSettings] = useState<HostSettings | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  const connect = useCallback(() => {
    if (!serverUrl.trim()) {
      setLastError('Veuillez entrer une adresse de serveur (ex: http://localhost:3001)');
      return;
    }
    if (!name.trim()) {
      setLastError('Veuillez entrer un nom de joueur.');
      return;
    }

    setLastError(null);
    setPhase('connecting');
    localStorage.setItem('civ_serverUrl', serverUrl);
    localStorage.setItem('civ_name', name);

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('hello', { name });
      setPhase('lobby');
    });

    socket.on('connect_error', (err) => {
      setLastError(`Impossible de se connecter au serveur: ${err.message}`);
      setPhase('disconnected');
    });

    socket.on('errorMsg', ({ message }) => {
      setLastError(message);
    });

    socket.on('roomJoined', (payload) => {
      setCode(payload.code);
      setYou(payload.you);
      setPlayers(payload.players);
      setHostId(payload.hostId);
      setHostSettings(payload.hostSettings);
      setPhase('lobby');
    });

    socket.on('roomUpdated', (payload) => {
      setPlayers(payload.players);
      setHostId(payload.hostId);
      setHostSettings(payload.hostSettings);
    });

    socket.on('gameStarted', ({ state, hostSettings }) => {
      setGameState(state);
      setHostSettings(hostSettings);
      setPhase('inGame');
    });

    socket.on('gameState', ({ state }) => {
      setGameState(state);
    });

    socket.on('disconnect', () => {
      setPhase('disconnected');
      setCode(null);
      setYou(null);
      setPlayers([]);
      setHostId(null);
      setGameState(null);
    });
  }, [serverUrl, name]);

  const disconnect = useCallback(() => {
    const s = socketRef.current;
    socketRef.current = null;
    try {
      s?.emit('leaveRoom');
      s?.disconnect();
    } finally {
      setPhase('disconnected');
      setCode(null);
      setYou(null);
      setPlayers([]);
      setHostId(null);
      setGameState(null);
    }
  }, []);

  const createRoom = useCallback(() => {
    socketRef.current?.emit('createRoom');
  }, []);

  const joinRoom = useCallback((joinCode: string) => {
    const trimmed = joinCode.trim().toUpperCase();
    if (!trimmed) {
      setLastError('Veuillez entrer un code de room pour rejoindre.');
      return;
    }
    socketRef.current?.emit('joinRoom', { code: trimmed });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  const updateHostSettings = useCallback((settings: HostSettings) => {
    socketRef.current?.emit('updateHostSettings', settings);
  }, []);

  const setCivChoice = useCallback((civChoice: any) => {
    // civChoice null = aléatoire
    socketRef.current?.emit('setCivChoice', { civChoice });
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    socketRef.current?.emit('action', { action });
  }, []);

  const isHost = useMemo(() => !!you && !!hostId && you.id === hostId, [you, hostId]);

  const myPlayerIndex = you?.playerIndex ?? null;

  const connected = !!socketRef.current?.connected;

  return {
    phase,
    connected,
    serverUrl,
    setServerUrl,
    name,
    setName,
    code,
    you,
    players,
    hostId,
    hostSettings,
    isHost,
    myPlayerIndex,
    gameState,
    lastError,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    startGame,
    updateHostSettings,
    setCivChoice,
    sendAction,
  };
}

