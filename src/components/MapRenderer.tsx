import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import type { GameState, TileData, TerrainType, FeatureType, ResourceType } from '../game/GameTypes';
import { getBaseTileYields } from '../game/YieldLogic';
import { Apple, Zap, Coins, Settings, FlaskConical, Hammer, Smile, DollarSign, Feather, ChevronRight, AlertCircle, Trash2 } from 'lucide-react';

interface MapRendererProps {
    state: GameState;
    onTileClick: (q: number, r: number) => void;
    selectedUnitId: string | null;
    selectedTileKey: string | null;
    movementHighlights: string[];
    offset: { x: number; y: number };
    onOffsetChange: (offset: { x: number; y: number }) => void;
}

const HEX_SIZE = 50;
const HEX_W = Math.sqrt(3) * HEX_SIZE;
const HEX_H = 2 * HEX_SIZE;

function hexToPixel(q: number, r: number) {
    return {
        x: HEX_W * (q + r / 2),
        y: HEX_H * (3 / 4) * r,
    };
}

// ASSET PATHS - Strictly top-down "floor" textures
const ASSETS = {
    GRASSLAND: '/assets/terrain/grassland.png',
    DESERT: '/assets/terrain/desert.png',
    OCEAN: '/assets/terrain/ocean.png',
    PLAINS: '/assets/terrain/plains.png',
    TUNDRA: '/assets/terrain/mountain_snow.png',
    SNOW: '/assets/terrain/mountain_snow.png',
    COAST: '/assets/terrain/ocean.png',
    MOUNTAIN: '/assets/terrain/mountain.png',
};

const RESOURCE_ICONS: Record<ResourceType, string> = {
    WHEAT: '🌾', HORSES: '🐎', IRON: '⚙️', GOLD_ORE: '💛',
    GEMS: '💎', FISH: '🐟', DEER: '🦌', OIL: '🛢️',
    COTTON: '☁️', SILK: '🧵',
};

const UNIT_ICONS: Record<string, string> = {
    SETTLER: '🏠', WARRIOR: '⚔️', ARCHER: '🏹', WORKER: '🔨',
    SCOUT: '👁️', SWORDSMAN: '🗡️', CATAPULT: '💣',
};

function hexPoints(cx: number, cy: number, r: number): string {
    return [0, 1, 2, 3, 4, 5]
        .map(i => {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        })
        .join(' ');
}

const TerrainDecorations: React.FC<{ tile: TileData }> = ({ tile }) => {
    if (tile.feature === 'FOREST') {
        return (
            <g filter="url(#unit-shadow)">
                <text x={-10} y={-5} fontSize={24}>🌲</text>
                <text x={8} y={10} fontSize={22}>🌲</text>
            </g>
        );
    }
    return null;
};

export const MapRenderer: React.FC<MapRendererProps> = ({ state, onTileClick, selectedUnitId, selectedTileKey, movementHighlights, offset, onOffsetChange }) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, movedPx: 0, originalX: 0, originalY: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX - offset.x,
            startY: e.clientY - offset.y,
            movedPx: 0,
            originalX: e.clientX,
            originalY: e.clientY
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const nx = e.clientX - dragRef.current.startX;
        const ny = e.clientY - dragRef.current.startY;
        const dx = e.clientX - dragRef.current.originalX;
        const dy = e.clientY - dragRef.current.originalY;
        dragRef.current.movedPx = Math.sqrt(dx * dx + dy * dy);
        onOffsetChange({ x: nx, y: ny });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const handleTileClick = (q: number, r: number) => {
        if (dragRef.current.movedPx > 10) return;
        onTileClick(q, r);
    };

    const currentPlayer = state?.players?.[state?.currentPlayerIndex];

    const sighted = useMemo(() => {
        if (!currentPlayer) return new Set<string>();
        const s = new Set<string>();
        Object.values(state.units).filter(u => u.ownerId === currentPlayer.id).forEach(u => {
            for (let dq = -3; dq <= 3; dq++) {
                for (let dr = Math.max(-3, -dq - 3); dr <= Math.min(3, -dq + 3); dr++) {
                    s.add(`${u.q + dq},${u.r + dr}`);
                }
            }
        });
        Object.values(state.cities).filter(c => c.ownerId === currentPlayer.id).forEach(c => {
            for (let dq = -3; dq <= 3; dq++) {
                for (let dr = Math.max(-3, -dq - 3); dr <= Math.min(3, -dq + 3); dr++) {
                    s.add(`${c.q + dq},${c.r + dr}`);
                }
            }
        });
        return s;
    }, [state.units, state.cities, currentPlayer?.id]);

    if (!currentPlayer) return null;

    return (
        <div
            className="map-container"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ overflow: 'hidden', width: '100%', height: '100%', background: '#050a15' }}
        >
            <svg style={{ width: '100%', height: '100%' }}>
                <defs>
                    <clipPath id="hex-clip">
                        <polygon points={hexPoints(0, 0, HEX_SIZE)} />
                    </clipPath>

                    <filter id="unit-shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity="0.8" />
                    </filter>

                    <filter id="tile-rim">
                        <feDropShadow dx="0" dy="0" stdDeviation="0.8" floodOpacity="0.4" />
                    </filter>

                    <filter id="rock-texture" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="5" seed="88" result="noise" />
                        <feDiffuseLighting in="noise" lightingColor="#eee" surfaceScale="3" result="diffuse">
                            <feDistantLight azimuth="45" elevation="50" />
                        </feDiffuseLighting>
                        <feColorMatrix type="matrix" values="0.7 0 0 0 0.1 0 0.7 0 0 0.1 0 0 0.7 0 0.1 0 0 0 1 0" />
                    </filter>

                    <style>{`
                        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
                        .unit-anim { animation: pulse 2s infinite ease-in-out; }
                        .tile-g:hover { filter: contrast(1.1) brightness(1.1); }
                        .fog { fill: #000; fill-opacity: 0.85; }
                    `}</style>
                </defs>

                <g style={{ transform: `translate(50%, 50%) translate(${offset.x}px, ${offset.y}px)` }}>
                    {Object.values(state.tiles).map(tile => {
                        const { x, y } = hexToPixel(tile.q, tile.r);
                        const key = `${tile.q},${tile.r}`;
                        const isSelected = selectedTileKey === key;
                        const isMovable = movementHighlights.includes(key);
                        const city = Object.values(state.cities).find(c => c.q === tile.q && c.r === tile.r);
                        const yields = getBaseTileYields(tile.terrain, tile.feature, tile.resource, tile.improvement);
                        const isVisible = sighted.has(key);
                        const assetUrl = ASSETS[tile.terrain] || ASSETS.GRASSLAND;

                        return (
                            <g key={key} transform={`translate(${x},${y})`} onClick={() => handleTileClick(tile.q, tile.r)} style={{ cursor: 'pointer' }} className="tile-g">
                                {isVisible ? (
                                    <>
                                        <polygon
                                            points={hexPoints(0, 0, HEX_SIZE)}
                                            fill="#1a1a1a"
                                        />
                                        <image
                                            href={assetUrl}
                                            x={-HEX_SIZE} y={-HEX_SIZE}
                                            width={HEX_SIZE * 2} height={HEX_SIZE * 2}
                                            clipPath="url(#hex-clip)"
                                            preserveAspectRatio="xMidYMid slice"
                                        />
                                        <polygon
                                            points={hexPoints(0, 0, HEX_SIZE)}
                                            fill="none"
                                            stroke={tile.borderOwnerId !== null ? state.players[tile.borderOwnerId]?.color : isSelected ? '#fff' : isMovable ? '#8ae26e' : 'rgba(255,255,255,0.05)'}
                                            strokeWidth={tile.borderOwnerId !== null ? 4 : isSelected ? 3 : isMovable ? 2 : 1}
                                        />
                                        {tile.borderOwnerId !== null && (
                                            <polygon points={hexPoints(0, 0, HEX_SIZE - 4)} fill={state.players[tile.borderOwnerId]?.color} fillOpacity={0.15} pointerEvents="none" />
                                        )}
                                        <TerrainDecorations tile={tile} />
                                        {tile.resource && !city && (
                                            <text y={15} fontSize={28} textAnchor="middle" filter="url(#unit-shadow)">{RESOURCE_ICONS[tile.resource]}</text>
                                        )}
                                        {!city && (
                                            <g transform="translate(0, -18)">
                                                {Array.from({ length: yields.food }).map((_, i) => <circle key={i} cx={-15 + i * 10} cy={-10} r={5} fill="#2ecc71" stroke="#000" strokeWidth={1} />)}
                                                {Array.from({ length: yields.production }).map((_, i) => <rect key={i} x={-17 + i * 10} y={2} width={8} height={8} fill="#f39c12" stroke="#000" strokeWidth={1} />)}
                                            </g>
                                        )}
                                        {city && (
                                            <g filter="url(#unit-shadow)">
                                                <rect x={-24} y={-24} width={48} height={42} rx={6} fill={state.players[city.ownerId]?.color || '#ccc'} stroke="#fff" strokeWidth={2.5} />
                                                <text y={4} fontSize={20} fill="white" textAnchor="middle" fontWeight="bold">{city.population}</text>
                                                <text y={42} fontSize={14} fill="white" textAnchor="middle" stroke={state.players[city.ownerId]?.color} strokeWidth={4} paintOrder="stroke" fontWeight="900">{city.name.toUpperCase()}</text>
                                                {city.ownerId === state.currentPlayerIndex && city.productionQueue.length === 0 && (
                                                    <circle cx={28} cy={-28} r={12} fill="#e74c3c" stroke="#fff" strokeWidth={2.5} className="unit-anim" />
                                                )}
                                            </g>
                                        )}
                                    </>
                                ) : (
                                    <polygon points={hexPoints(0, 0, HEX_SIZE)} className="fog" />
                                )}
                                {isVisible && isSelected && <polygon points={hexPoints(0, 0, HEX_SIZE)} fill="none" stroke="#fff" strokeWidth={5} opacity={0.7} filter="drop-shadow(0 0 10px white)" />}
                            </g>
                        );
                    })}

                    {Object.values(state.units).map(unit => {
                        const { x, y } = hexToPixel(unit.q, unit.r);
                        const isSelected = selectedUnitId === unit.id;
                        const player = state.players[unit.ownerId];
                        const isVisible = sighted.has(`${unit.q},${unit.r}`);

                        if (!isVisible && unit.ownerId !== currentPlayer.id) return null;

                        return (
                            <g key={unit.id} transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }} className={isSelected ? 'unit-anim' : ''}>
                                <circle r={HEX_SIZE * 0.65} fill={player?.color || '#fff'} stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={isSelected ? 5 : 2} filter="url(#unit-shadow)" />
                                <text y={12} fontSize={36} textAnchor="middle" style={{ filter: 'drop-shadow(0 3px 3px black)' }}>
                                    {UNIT_ICONS[unit.type] || '?'}
                                </text>
                                {unit.actionsDone && <circle r={HEX_SIZE * 0.65} fill="rgba(0,0,0,0.6)" />}
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};
