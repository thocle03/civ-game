import { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeGame, endTurn, moveUnit, foundCity, setResearch, enqueueProduction, improveTile, autoExplore, autoImprove } from './game/GameCore';
import { TECH_DEFS } from './game/DataDefs';
import type { GameState, Unit, TechType } from './game/GameTypes';
import { TechTree } from './components/TechTree';
import { CityMenu } from './components/CityMenu';
import { MapRenderer } from './components/MapRenderer';
import { hexDistance } from './game/HexMath';
import { getBaseTileYields } from './game/YieldLogic';
import { Settings, FlaskConical, Hammer, Smile, DollarSign, Feather, ChevronRight, AlertCircle, Apple, Zap, Coins } from 'lucide-react';
import './modals.css';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTileKey, setSelectedTileKey] = useState<string | null>(null);
  const [showTechTree, setShowTechTree] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Center camera on a specific hex
  const centerOn = useCallback((q: number, r: number) => {
    const HEX_SIZE = 50;
    const HEX_W = Math.sqrt(3) * HEX_SIZE;
    const HEX_H = 2 * HEX_SIZE;
    const px = HEX_W * (q + r / 2);
    const py = HEX_H * (3 / 4) * r;
    setOffset({ x: -px, y: -py });
  }, []);

  useEffect(() => {
    const initial = initializeGame(5);
    setGameState(initial);
    // Center on first human unit
    const firstUnit = Object.values(initial.units).find(u => u.ownerId === 0);
    if (firstUnit) centerOn(firstUnit.q, firstUnit.r);
  }, [centerOn]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e' && selectedUnitId && gameState) {
        setGameState(prev => {
          if (!prev || !selectedUnitId) return prev;
          const u = prev.units[selectedUnitId];
          const mode = u.type === 'WORKER' ? 'IMPROVE' : 'EXPLORE';
          const newAuto = u.automation === mode ? null : mode;
          if (newAuto) showNotif(`🧭 ${u.type} starting Auto-${mode}`);
          else showNotif(`🛑 Automation canceled`);
          return {
            ...prev,
            units: {
              ...prev.units,
              [selectedUnitId]: { ...u, automation: newAuto }
            }
          };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUnitId, gameState]);

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const handleTileClick = useCallback((q: number, r: number) => {
    if (!gameState) return;
    const tileKey = `${q},${r}`;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return;
    const isPlayerTurn = !currentPlayer.isAI;

    // 1. Prioritize Selection/Cycling if clicking a hex with our own unit(s)
    const myUnitsOnTile = Object.values(gameState.units).filter(
      (u: Unit) => u.q === q && u.r === r && u.ownerId === currentPlayer.id
    );

    if (myUnitsOnTile.length > 0) {
      // If our current selection is already on this tile, and we have multiple units, cycle
      if (selectedUnitId && myUnitsOnTile.some(u => u.id === selectedUnitId)) {
        if (myUnitsOnTile.length > 1) {
          const currIdx = myUnitsOnTile.findIndex(u => u.id === selectedUnitId);
          const nextIdx = (currIdx + 1) % myUnitsOnTile.length;
          setSelectedUnitId(myUnitsOnTile[nextIdx].id);
          setSelectedTileKey(tileKey);
          setSelectedCityId(null);
          return;
        }
        // If only 1 unit and already selected, don't return so we can check for city selection underneath
      } else {
        // Just select the first unit and exit
        setSelectedUnitId(myUnitsOnTile[0].id);
        setSelectedTileKey(tileKey);
        setSelectedCityId(null);
        return;
      }
    }

    // 2. Movement logic: if a unit is currently selected, try to move it to the clicked hex
    if (selectedUnitId && isPlayerTurn) {
      const unit = gameState.units[selectedUnitId];
      if (unit && unit.ownerId === currentPlayer.id && !unit.actionsDone) {
        const dist = hexDistance({ q: unit.q, r: unit.r, s: -unit.q - unit.r }, { q, r, s: -q - r });
        if (dist > 0) {
          if (dist <= unit.movement) {
            setGameState(prev => {
              if (!prev) return null;
              const next = moveUnit(prev, selectedUnitId, q, r);
              if (next === prev) {
                showNotif("🚫 Invalid move (blocked or illegal)");
              }
              return next;
            });
            return;
          } else {
            showNotif("⚠️ Too far for this turn!");
            return;
          }
        }
      }
    }

    // 3. Selection fallthrough: check for Cities/Enemies on the tile
    setSelectedTileKey(tileKey);
    const city = Object.values(gameState.cities).find(c => c.q === q && c.r === r);
    if (city && city.ownerId === currentPlayer.id) {
      setSelectedCityId(city.id);
      setSelectedUnitId(null);
    } else {
      setSelectedCityId(null);
      // Only deselect unit if we clicked an empty tile or enemy
      const enemyOnTile = Object.values(gameState.units).find(u => u.q === q && u.r === r && u.ownerId !== currentPlayer.id);
      if (!city || enemyOnTile) {
        setSelectedUnitId(null);
      }
    }
  }, [selectedUnitId, gameState, setSelectedUnitId, setSelectedCityId, setSelectedTileKey, showNotif]);

  const selectedUnit = useMemo(() => {
    if (!selectedUnitId || !gameState) return null;
    return gameState.units[selectedUnitId] || null;
  }, [selectedUnitId, gameState]);

  const selectedCity = useMemo(() => {
    if (!selectedCityId || !gameState) return null;
    return gameState.cities[selectedCityId] || null;
  }, [selectedCityId, gameState]);

  const selectedTile = useMemo(() => {
    if (!selectedTileKey || !gameState) return null;
    return gameState.tiles[selectedTileKey] || null;
  }, [selectedTileKey, gameState]);

  if (!gameState) return <div className="loading">🌍 Generating World...</div>;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isPlayerTurn = !currentPlayer?.isAI;

  // Compute movement highlights: adjacent tiles to selected unit
  const movementHighlights: string[] = [];
  if (selectedUnitId) {
    const unit = gameState.units[selectedUnitId];
    if (unit && unit.movement > 0) {
      const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
      for (const [dq, dr] of dirs) {
        movementHighlights.push(`${unit.q + dq},${unit.r + dr}`);
      }
    }
  }

  const handleEndTurn = () => {
    const prevState = gameState;
    setGameState(prev => {
      if (!prev) return null;
      let s = endTurn(prev);

      // Basic event detection (comparing prev/next)
      if (prevState) {
        // Check for new units
        const newUnits = Object.keys(s.units).filter(id => !prevState.units[id] && s.units[id].ownerId === prev.currentPlayerIndex);
        newUnits.forEach(id => showNotif(`✨ New unit: ${s.units[id].type}!`));

        // Check for completed buildings / population
        Object.keys(s.cities).forEach(cid => {
          const oldCity = prevState.cities[cid];
          const newCity = s.cities[cid];
          if (oldCity && newCity && newCity.buildings.length > oldCity.buildings.length) {
            const newB = newCity.buildings[newCity.buildings.length - 1];
            showNotif(`🏛️ ${newCity.name} finished: ${newB}!`);
          }
          if (oldCity && newCity && newCity.population > oldCity.population) {
            showNotif(`👨‍👩‍👧 ${newCity.name} population grew to ${newCity.population}!`);
          }
        });

        // Check for tech
        const pid = prev.currentPlayerIndex;
        if (s.players[pid].science.unlocked.length > prevState.players[pid].science.unlocked.length) {
          const newT = s.players[pid].science.unlocked[s.players[pid].science.unlocked.length - 1];
          showNotif(`🔬 Discovery! We unlocked ${newT.replace('_', ' ')}!`);
        }
      }

      // Skip AI turns automatically
      let safety = 0;
      while (s.players[s.currentPlayerIndex]?.isAI && safety < 20) {
        s = endTurn(s);
        safety++;
      }
      return s;
    });
    setSelectedUnitId(null);
    setSelectedTileKey(null);
    // After turn, center on next unit if it's player turn
    setTimeout(() => {
      setGameState(current => {
        if (!current) return current;
        const nextUnit = Object.values(current.units).find(u => u.ownerId === current.currentPlayerIndex && !u.actionsDone);
        if (nextUnit) centerOn(nextUnit.q, nextUnit.r);
        return current;
      });
    }, 100);
  };

  const handleFoundCity = () => {
    if (selectedUnitId && gameState.units[selectedUnitId]?.type === 'SETTLER') {
      const unit = gameState.units[selectedUnitId];
      // Check distance for feedback
      const tooClose = Object.values(gameState.cities).find(c => {
        const dist = hexDistance({ q: c.q, r: c.r, s: -c.q - c.r }, { q: unit.q, r: unit.r, s: -unit.q - unit.r });
        return dist < 4;
      });
      if (tooClose) {
        showNotif(`🚫 Too close to ${tooClose.name} (min 4 hexes)`);
        return;
      }

      const newCityId = `city_0_${Date.now()}`;
      setGameState(prev => {
        if (!prev) return null;
        return foundCity(prev, selectedUnitId, newCityId);
      });

      setSelectedUnitId(null);
      setSelectedCityId(newCityId); // Set immediately
      showNotif('🏙️ City founded! Choose your first production.');
    }
  };

  const handleSetResearch = (tech: TechType) => {
    setGameState(prev => prev ? setResearch(prev, currentPlayer.id, tech) : null);
    setShowTechTree(false);
    showNotif(`🔬 Now researching: ${tech.replace('_', ' ')}`);
  };

  const handleEnqueue = (type: 'UNIT' | 'BUILDING' | 'WONDER', id: string) => {
    if (selectedCityId) {
      setGameState(prev => prev ? enqueueProduction(prev, selectedCityId, type, id) : null);
    }
  };

  const handleImprove = (imp: string) => {
    if (selectedUnitId) {
      setGameState(prev => prev ? improveTile(prev, selectedUnitId, imp) : null);
      showNotif(`🔨 Building ${imp}...`);
    }
  };

  const scienceText = currentPlayer.science.researching
    ? `${currentPlayer.science.researching?.replace('_', ' ')} (${currentPlayer.science.progress}/${currentPlayer.science.researching ? 35 : '?'})`
    : 'No Research';

  const dateText = gameState.turn <= 80
    ? `${4000 - gameState.turn * 40} BC`
    : `${(gameState.turn - 80) * 20} AD`;

  return (
    <div className="game-wrapper">
      {/* ── TOP BAR ── */}
      <header className="top-bar">
        <div className="stats-group">
          <div className="civ-name" style={{ borderColor: currentPlayer.color, color: currentPlayer.color }}>
            🏛️ {currentPlayer.civilizationName}
          </div>
          <div className={`stat btn-stat ${!currentPlayer.science.researching ? 'pulse-alert' : ''}`} onClick={() => setShowTechTree(true)} title="Open Tech Tree">
            <FlaskConical size={16} color={!currentPlayer.science.researching ? '#e74c3c' : '#3b8bdb'} />&nbsp;+{currentPlayer.globalYields.science}
            {currentPlayer.science.researching
              ? (
                <span className="stat-sub">
                  {currentPlayer.science.researching.replace('_', ' ')}
                  <span style={{ marginLeft: 6, color: '#3498db' }}>
                    ({Math.ceil((TECH_DEFS[currentPlayer.science.researching as TechType].cost - currentPlayer.science.progress) / Math.max(1, currentPlayer.globalYields.science))} turns)
                  </span>
                </span>
              )
              : <span className="stat-sub" style={{ color: '#e74c3c' }}>[RESEARCH NEEDED]</span>
            }
          </div>
          <div className="stat"><DollarSign size={16} />&nbsp;{currentPlayer.gold} (+{currentPlayer.globalYields.gold})</div>
          <div className="stat"><Feather size={16} />&nbsp;+{currentPlayer.globalYields.culture}</div>
          <div className="stat"><Hammer size={16} />&nbsp;+{currentPlayer.globalYields.production}</div>
          <div className="stat"><Smile size={16} />&nbsp;{currentPlayer.happiness}</div>
        </div>
        <div className="turn-info">
          {isPlayerTurn && (Object.values(gameState.cities).some(c => c.ownerId === currentPlayer.id && c.productionQueue.length === 0) || !currentPlayer.science.researching) && (
            <div className="pending-actions" style={{ color: '#e74c3c', marginRight: 15, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={14} /> Attention Needed
            </div>
          )}
          <span className="era-badge">{currentPlayer.era}</span>
          <span className="turn-text">Turn {gameState.turn} &middot; {dateText}</span>
          <button className="icon-btn" title="Settings"><Settings size={18} /></button>
        </div>
      </header>

      {/* ── MAP ── */}
      <main className="main-area">
        <MapRenderer
          state={gameState}
          onTileClick={handleTileClick}
          selectedUnitId={selectedUnitId}
          selectedTileKey={selectedTileKey}
          movementHighlights={movementHighlights}
          offset={offset}
          onOffsetChange={setOffset}
        />

        {/* ── LEFT / BOTTOM PANEL ── */}
        <div className="side-panel">
          {/* Tile info */}
          {selectedTile && !selectedUnit && (
            <div className="panel-section tile-info">
              <div className="panel-label">TILE</div>
              <div className="panel-row">
                <span className="terrain-badge" style={{ background: '#333' }}>{selectedTile.terrain}</span>
                {selectedTile.feature !== 'NONE' && <span className="terrain-badge">{selectedTile.feature}</span>}
                {selectedTile.improvement && <span className="terrain-badge" style={{ color: '#f39c12' }}>{selectedTile.improvement}</span>}
              </div>
              <div className="panel-row yields-row">
                {(() => {
                  const y = getBaseTileYields(selectedTile.terrain, selectedTile.feature, selectedTile.resource, selectedTile.improvement);
                  return (
                    <>
                      {y.food > 0 && <span className="yield"><Apple size={12} color="#2ecc71" /> {y.food}</span>}
                      {y.production > 0 && <span className="yield"><Zap size={12} color="#f39c12" /> {y.production}</span>}
                      {y.gold > 0 && <span className="yield"><Coins size={12} color="#f1c40f" /> {y.gold}</span>}
                    </>
                  );
                })()}
              </div>
              {selectedTile.resource && (
                <div className="panel-row">Resource: {selectedTile.resource}</div>
              )}
            </div>
          )}

          {/* Unit info */}
          {selectedUnit && (
            <div className="panel-section unit-panel">
              <div className="panel-label">{selectedUnit.type}</div>
              <div className="hp-bar-wrapper">
                <div className="hp-bar" style={{
                  width: `${(selectedUnit.hp / selectedUnit.maxHp) * 100}%`,
                  background: selectedUnit.hp > 7 ? '#2ecc71' : selectedUnit.hp > 4 ? '#f39c12' : '#e74c3c'
                }} />
              </div>
              <div className="panel-row">⚔️ {selectedUnit.combat} &nbsp; 👟 {selectedUnit.movement}/{selectedUnit.maxMovement}</div>
              {selectedUnit.ownerId === currentPlayer.id && (
                <div className="btns-row">
                  {selectedUnit.type === 'SETTLER' && (
                    <button className="action-btn green" onClick={handleFoundCity} disabled={selectedUnit.movement <= 0}>🏙️ Found City</button>
                  )}
                  {selectedUnit.type === 'WORKER' && (
                    <>
                      <button className="action-btn orange" onClick={() => handleImprove('FARM')} disabled={selectedUnit.movement <= 0}>🚜 Farm</button>
                      <button className="action-btn orange" onClick={() => handleImprove('MINE')} disabled={selectedUnit.movement <= 0}>⛏️ Mine</button>
                    </>
                  )}
                  <button className="action-btn" onClick={() => {
                    setGameState(prev => {
                      if (!prev || !selectedUnitId) return prev;
                      const u = prev.units[selectedUnitId];
                      const mode = u.type === 'WORKER' ? 'IMPROVE' : 'EXPLORE';
                      const newAuto = u.automation === mode ? null : mode;
                      if (newAuto) showNotif(`🧭 ${u.type} starting Auto-${mode}`);
                      else showNotif(`🛑 Automation canceled`);
                      return {
                        ...prev,
                        units: {
                          ...prev.units,
                          [selectedUnitId]: { ...u, automation: newAuto }
                        }
                      };
                    });
                  }} disabled={selectedUnit.movement <= 0}>
                    {selectedUnit.automation ? '🛑 Stop Auto' : '🧭 Auto (E)'}
                  </button>
                  <button className="action-btn" onClick={() => {
                    setGameState(prev => {
                      if (!prev || !selectedUnitId) return prev;
                      const u = prev.units[selectedUnitId];
                      return {
                        ...prev,
                        units: {
                          ...prev.units,
                          [selectedUnitId]: { ...u, movement: 0, actionsDone: true }
                        }
                      };
                    });
                    showNotif("⌛ Unit action skipped");
                  }} disabled={selectedUnit.movement <= 0}>⌛ Skip</button>
                  <button className="action-btn" onClick={() => setSelectedUnitId(null)}>Deselect</button>
                </div>
              )}
            </div>
          )}

          {/* City quick info */}
          {selectedTile?.hasCity && (() => {
            const city = Object.values(gameState.cities).find(c => c.q === selectedTile.q && c.r === selectedTile.r);
            if (!city) return null;
            return (
              <div className="panel-section city-quick">
                <div className="panel-label">🏙️ {city.name}</div>
                <div className="panel-row">Pop: {city.population} &nbsp; 🍎 {city.food}/{city.foodToGrow}</div>
                <div className="panel-row">⚙️ {city.productionAccumulated} — Queue: {city.productionQueue[0]?.id || 'idle'}</div>
                {city.ownerId === currentPlayer.id && (
                  <button className="action-btn" onClick={() => setSelectedCityId(city.id)}>
                    Manage City <ChevronRight size={14} />
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── END TURN ── */}
        <button className={`end-turn-btn ${!isPlayerTurn ? 'waiting' : ''}`} onClick={handleEndTurn} disabled={!isPlayerTurn}>
          {isPlayerTurn ? '⏭ END TURN' : '⏳ AI Turn...'}
        </button>

        {/* ── UNIT SHORTCUTS ── */}
        {isPlayerTurn && (
          <div style={{ position: 'absolute', bottom: 90, right: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(gameState.units).filter(u => u.ownerId === currentPlayer.id && !u.actionsDone).map(u => (
              <button
                key={u.id}
                className="action-btn"
                style={{ borderRadius: '50%', width: 50, height: 50, justifyContent: 'center', pointerEvents: 'auto', background: 'rgba(0,0,0,0.6)', border: `2px solid ${currentPlayer.color}` }}
                onClick={() => {
                  setSelectedUnitId(u.id);
                  centerOn(u.q, u.r);
                }}
              >
                {u.type === 'SETTLER' ? '🏠' : '⚔️'}
              </button>
            ))}
          </div>
        )}

        {/* ── NOTIF ── */}
        {notification && (
          <div className="notif-toast">
            <AlertCircle size={16} /> {notification}
          </div>
        )}
      </main>

      {/* ── MODALS ── */}
      {showTechTree && (
        <TechTree player={currentPlayer} onSelectResearch={handleSetResearch} onClose={() => setShowTechTree(false)} />
      )}
      {selectedCity && (
        <CityMenu
          city={selectedCity}
          unlockedTechs={currentPlayer.science.unlocked}
          onEnqueue={handleEnqueue}
          onClose={() => setSelectedCityId(null)}
        />
      )}
    </div>
  );
}
