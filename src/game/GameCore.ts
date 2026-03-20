import type { GameState, TechType, UnitType, BuildingType, PlayerId, TileData, Unit, City } from './GameTypes';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, CITY_NAMES } from './DataDefs';
import { generateMap } from './MapGenerator';
import { getBaseTileYields } from './YieldLogic';
import { CIV_DEFS, getCivDef, type CivKey } from './Civilizations';

export function initializeGame(numPlayers: number, civKeys?: CivKey[]): GameState {
    const tiles = generateMap();
    const players: GameState['players'] = {};
    const units: GameState['units'] = {};
    const cities: GameState['cities'] = {};

    const keys = Object.keys(tiles);
    const landKeys = keys.filter(k => !['OCEAN', 'COAST', 'MOUNTAIN'].includes(tiles[k].terrain));

    for (let i = 0; i < numPlayers; i++) {
        const civKey = civKeys?.[i] ?? CIV_DEFS[i % CIV_DEFS.length].key;
        const civ = getCivDef(civKey);
        const baseYields = { food: 0, production: 0, gold: 0, science: 5, culture: 2 };
        const bonus = civ.startingGlobalYields;
        const globalYields = {
            food: baseYields.food + (bonus.food ?? 0),
            production: baseYields.production + (bonus.production ?? 0),
            gold: baseYields.gold + (bonus.gold ?? 0),
            science: baseYields.science + (bonus.science ?? 0),
            culture: baseYields.culture + (bonus.culture ?? 0),
        };
        players[i] = {
            id: i,
            name: i === 0 ? 'You' : civ.playerName,
            civilizationName: civ.civilizationName,
            isAI: i > 0,
            civKey,
            color: civ.color,
            globalYields,
            science: { unlocked: [], researching: 'AGRICULTURE', progress: 0 },
            gold: 0, culture: 0, happiness: 10,
            era: 'Ancient',
            revealedTiles: [],
        };

        // Find spread-out starting position
        let startTile = landKeys[Math.floor(Math.random() * landKeys.length)];
        for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = landKeys[Math.floor(Math.random() * landKeys.length)];
            // Try to pick tiles away from other settlers
            const tooClose = Object.values(units).some(u => {
                const dq = u.q - tiles[candidate].q;
                const dr = u.r - tiles[candidate].r;
                return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) < 8;
            });
            if (!tooClose) { startTile = candidate; break; }
        }

        const { q, r } = tiles[startTile];
        const sid = `unit_${i}_settler`;
        units[sid] = { id: sid, type: 'SETTLER', ownerId: i, q, r, s: -q - r, hp: 10, maxHp: 10, combat: 0, movement: 2, maxMovement: 2, actionsDone: false, hasAttacked: false };
        const wid = `unit_${i}_warrior`;
        units[wid] = { id: wid, type: 'WARRIOR', ownerId: i, q: q + 1, r, s: -(q + 1) - r, hp: 10, maxHp: 10, combat: UNIT_DEFS['WARRIOR'].combat, movement: 2, maxMovement: 2, actionsDone: false, hasAttacked: false };
    }

    let nextState = { turn: 1, currentPlayerIndex: 0, players, tiles, units, cities, mapRadius: 22 };

    // Barbarian player
    players[-1] = {
        id: -1,
        name: 'Barbarians',
        civilizationName: 'Barbarian Tribe',
        isAI: true,
        color: '#7f8c8d',
        globalYields: { food: 0, production: 0, gold: 0, science: 0, culture: 0 },
        science: { unlocked: [], researching: null, progress: 0 },
        gold: 0, culture: 0, happiness: 0,
        era: 'Ancient',
        revealedTiles: [],
    };

    // Initial vision and yields for all players (including barbarians)
    for (const pId of [-1, ...Object.keys(players).map(Number).filter(p => p !== -1)]) {
        nextState = updateRevealedTiles(nextState, pId);
        nextState = calculatePlayerYields(nextState, pId);
    }

    return nextState;
}

export function updateRevealedTiles(state: GameState, playerId: number): GameState {
    const player = state.players[playerId];
    const revealedSlots = new Set(player.revealedTiles);

    Object.values(state.units).filter(u => u.ownerId === playerId).forEach(u => {
        for (let q = -2; q <= 2; q++) {
            for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
                revealedSlots.add(`${u.q + q},${u.r + r}`);
            }
        }
    });

    Object.values(state.cities).filter(c => c.ownerId === playerId).forEach(c => {
        for (let q = -3; q <= 3; q++) {
            for (let r = Math.max(-3, -q - 3); r <= Math.min(3, -q + 3); r++) {
                revealedSlots.add(`${c.q + q},${c.r + r}`);
            }
        }
    });

    return {
        ...state,
        players: {
            ...state.players,
            [playerId]: { ...player, revealedTiles: Array.from(revealedSlots) }
        }
    };
}

export function calculateCityYields(state: GameState, cityId: string): City {
    const city = state.cities[cityId];
    if (!city) throw new Error(`City ${cityId} not found`);

    // Start with base city square (free)
    const cityTile = state.tiles[`${city.q},${city.r}`];
    let yields = getBaseTileYields(cityTile.terrain, cityTile.feature, cityTile.resource, cityTile.improvement);

    // Base yields for ANY city (guarantees a floor)
    yields.food = Math.max(yields.food, 2);
    yields.production = Math.max(yields.production, 1);
    yields.gold = Math.max(yields.gold, 1);
    yields.science = (yields.science || 0) + 2;
    yields.culture = (yields.culture || 0) + 1;

    // Population logic: one citizen stays in city, others work the best tiles in borders
    const borderTiles = Object.values(state.tiles).filter(t => t.borderOwnerId === city.ownerId && !(t.q === city.q && t.r === city.r));

    // Calculate quality for each border tile
    const sortedTiles = borderTiles.map(t => {
        const ty = getBaseTileYields(t.terrain, t.feature, t.resource, t.improvement);
        return {
            t,
            y: ty,
            score: (ty.food * 2) + (ty.production * 1.5) + (ty.gold * 0.5) + (ty.science * 1) + (ty.culture * 1)
        };
    }).sort((a, b) => b.score - a.score);

    // Take top (pop - 1) tiles. (Citizens work tiles up to population limit)
    const workedCount = Math.min(city.population - 1, sortedTiles.length);
    for (let i = 0; i < workedCount; i++) {
        const ty = sortedTiles[i].y;
        yields.food += ty.food;
        yields.production += ty.production;
        yields.gold += ty.gold;
        yields.culture += ty.culture;
        yields.science += ty.science;
    }

    // Add building yields
    city.buildings.forEach(bId => {
        const bDef = BUILDING_DEFS[bId];
        if (bDef.yields.food) yields.food += bDef.yields.food;
        if (bDef.yields.production) yields.production += bDef.yields.production;
        if (bDef.yields.gold) yields.gold += bDef.yields.gold;
        if (bDef.yields.science) yields.science += bDef.yields.science;
        if (bDef.yields.culture) yields.culture += bDef.yields.culture;
    });

    return { ...city, yields };
}

export function calculatePlayerYields(state: GameState, playerId: number): GameState {
    const player = state.players[playerId];
    if (!player) return state;

    const total = { food: 0, production: 0, gold: 0, science: 5, culture: 2 }; // base yields for civilization
    const newCities = { ...state.cities };

    Object.keys(state.cities).forEach(cid => {
        if (state.cities[cid].ownerId === playerId) {
            try {
                const updatedCity = calculateCityYields(state, cid);
                newCities[cid] = updatedCity;
                const cy = updatedCity.yields;
                total.food += cy.food;
                total.production += cy.production;
                total.gold += cy.gold;
                total.science += cy.science;
                total.culture += cy.culture;
            } catch (e) {
                console.error(e);
            }
        }
    });

    const updatedPlayer = { ...player, globalYields: total };
    return {
        ...state,
        players: { ...state.players, [playerId]: updatedPlayer },
        cities: newCities,
    };
}

export function endTurn(state: GameState): GameState {
    let nextState: GameState = {
        ...state,
        players: { ...state.players },
        tiles: { ...state.tiles },
        units: { ...state.units },
        cities: { ...state.cities },
    };
    const pid = nextState.currentPlayerIndex;
    const player = { ...nextState.players[pid] };
    nextState.players[pid] = player;

    nextState = calculatePlayerYields(nextState, pid);

    // Science progress
    if (player.science.researching) {
        player.science = { ...player.science, progress: player.science.progress + player.globalYields.science };
        const tech = TECH_DEFS[player.science.researching!];
        if (player.science.progress >= tech.cost) {
            player.science = {
                ...player.science,
                unlocked: [...player.science.unlocked, player.science.researching as TechType],
                progress: player.science.progress - tech.cost,
                researching: null,
            };
        }
    }

    player.gold += player.globalYields.gold;
    player.culture += player.globalYields.culture;

    // Process cities
    for (const cityId of Object.keys(nextState.cities)) {
        if (nextState.cities[cityId].ownerId !== pid) continue;
        const city = { ...nextState.cities[cityId] };
        nextState.cities[cityId] = city;

        // City health regeneration
        if (city.hp < city.maxHp) {
            city.hp = Math.min(city.maxHp, city.hp + 5);
        }

        // Food & growth
        city.food += city.yields.food;
        if (city.food >= city.foodToGrow) {
            city.population++;
            city.food -= city.foodToGrow;
            city.foodToGrow = Math.floor(city.foodToGrow * 1.6);
            city.yields = { ...city.yields, science: city.yields.science + 1 };
        }

        // Production
        if (city.productionQueue.length > 0) {
            city.productionAccumulated += city.yields.production;
            const item = city.productionQueue[0];
            const cost = item.type === 'UNIT' ? UNIT_DEFS[item.id as UnitType].cost
                : BUILDING_DEFS[item.id as BuildingType].cost;

            if (city.productionAccumulated >= cost) {
                city.productionAccumulated -= cost;
                city.productionQueue = city.productionQueue.slice(1);

                if (item.type === 'UNIT') {
                    const uid = `unit_${pid}_${Date.now()}_${Math.random()}`;
                    nextState.units[uid] = {
                        id: uid, type: item.id as UnitType, ownerId: pid, q: city.q, r: city.r, s: -city.q - city.r,
                        hp: 10, maxHp: 10, combat: UNIT_DEFS[item.id as UnitType].combat,
                        movement: UNIT_DEFS[item.id as UnitType].movement,
                        maxMovement: UNIT_DEFS[item.id as UnitType].movement,
                        actionsDone: false, hasAttacked: false,
                    };
                } else if (item.type === 'BUILDING') {
                    const bDef = BUILDING_DEFS[item.id as BuildingType];
                    city.buildings = [...city.buildings, item.id as BuildingType];
                    const y = { ...city.yields };
                    if (bDef.yields.food) y.food += bDef.yields.food;
                    if (bDef.yields.production) y.production += bDef.yields.production;
                    if (bDef.yields.science) y.science += bDef.yields.science;
                    if (bDef.yields.gold) y.gold += bDef.yields.gold;
                    if (bDef.yields.culture) y.culture += bDef.yields.culture;
                    city.yields = y;
                }
            }
        }
    }

    // Border expansion - cities grow territory naturally based on culture
    const cultureNeeded = 10 + (Object.values(nextState.tiles).filter(t => t.borderOwnerId === pid).length * 2);
    if (player.culture >= cultureNeeded) {
        // Find best tiles to expand into
        const expansionKeys = Object.keys(nextState.tiles).filter(k => {
            const t = nextState.tiles[k];
            if (t.borderOwnerId !== null) return false;
            // Adjacent to current border
            const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
            return dirs.some(d => {
                const adjKey = `${t.q + d[0]},${t.r + d[1]}`;
                const adj = nextState.tiles[adjKey];
                return adj && adj.borderOwnerId === pid;
            });
        });
        if (expansionKeys.length > 0) {
            const k = expansionKeys[Math.floor(Math.random() * expansionKeys.length)];
            nextState.tiles[k] = { ...nextState.tiles[k], borderOwnerId: pid };
            player.culture -= cultureNeeded;
        }
    }

    // ── NEXT PLAYER ──
    const pIds = Object.keys(nextState.players).map(Number).sort((a, b) => a - b);
    const currIdx = pIds.indexOf(pid);
    const nextPid = pIds[(currIdx + 1) % pIds.length];

    if (nextPid === 0) nextState.turn++;
    nextState.currentPlayerIndex = nextPid;

    // Reset movements for ALL units of NEW current player
    for (const id in nextState.units) {
        if (nextState.units[id].ownerId === nextPid) {
            nextState.units[id] = { ...nextState.units[id], movement: nextState.units[id].maxMovement, actionsDone: false, hasAttacked: false };
        }
    }

    // Run automation for the new current player (mainly useful for human turns)
    nextState = runAutomation(nextState, nextPid);

    // Run AI if it's AI turn (including Barbarians)
    if (nextState.players[nextPid].isAI) {
        nextState = runAI(nextState, nextPid);
    }

    // ── BARBARIAN SPAWNING (fog of war only) ──
    if (nextPid === 0 && nextState.turn % 2 === 0) {
        const playerSighted = updateRevealedTiles(nextState, 0).players[0].revealedTiles;
        const sightedSet = new Set(playerSighted);

        const spawnCandidates = Object.keys(nextState.tiles).filter(k => {
            const t = nextState.tiles[k];
            if (['OCEAN', 'MOUNTAIN', 'ICE'].includes(t.terrain) || t.hasCity || t.borderOwnerId !== null) return false;
            // Far from player 0 vision
            if (sightedSet.has(k)) return false;
            // Far from cities
            return Object.values(nextState.cities).every(c => {
                const dist = Math.max(Math.abs(c.q - t.q), Math.abs(c.r - t.r), Math.abs(-(c.q - t.q) - (c.r - t.r)));
                return dist > 5;
            });
        });

        if (spawnCandidates.length > 0 && Math.random() < 0.3) {
            const k = spawnCandidates[Math.floor(Math.random() * spawnCandidates.length)];
            const t = nextState.tiles[k];
            const bid = `barb_${Date.now()}_${Math.random()}`;
            nextState.units[bid] = {
                id: bid, type: 'WARRIOR', ownerId: -1, q: t.q, r: t.r, s: -t.q - t.r,
                hp: 10, maxHp: 10, combat: UNIT_DEFS['WARRIOR'].combat,
                movement: 2, maxMovement: 2, actionsDone: false, hasAttacked: false,
            };
        }
    }

    return nextState;
}

export function runAutomation(state: GameState, playerId: number): GameState {
    let next = state;
    for (const uid of Object.keys(state.units)) {
        const u = state.units[uid];
        if (u.ownerId === playerId && u.automation && !u.actionsDone) {
            if (u.automation === 'EXPLORE') {
                next = autoExplore(next, uid);
            } else if (u.automation === 'IMPROVE') {
                next = autoImprove(next, uid);
            }
        }
    }
    return next;
}

function runAI(state: GameState, pid: number): GameState {
    let s = state;
    const player = s.players[pid];

    // 1. Research
    if (!player.science.researching) {
        const available = (Object.keys(TECH_DEFS) as TechType[]).filter(
            t => !player.science.unlocked.includes(t) && TECH_DEFS[t].prereqs.every(p => player.science.unlocked.includes(p))
        );
        if (available.length) {
            s = setResearch(s, pid, available[Math.floor(Math.random() * available.length)]);
        }
    }

    // 2. City Management
    for (const cid of Object.keys(s.cities)) {
        const city = s.cities[cid];
        if (city.ownerId !== pid || city.productionQueue.length > 0) continue;

        const myUnits = Object.values(s.units).filter(u => u.ownerId === pid);
        const mySettlers = myUnits.filter(u => u.type === 'SETTLER');

        if (mySettlers.length === 0 && Object.keys(s.cities).filter(c => s.cities[c].ownerId === pid).length < 4 && Math.random() < 0.4) {
            s = enqueueProduction(s, cid, 'UNIT', 'SETTLER');
        } else {
            const possible = ['WARRIOR', 'ARCHER', 'SCOUT'];
            const pick = possible[Math.floor(Math.random() * possible.length)] as UnitType;
            s = enqueueProduction(s, cid, 'UNIT', pick);
        }
    }

    // 3. Unit Movements
    const targets = [
        ...Object.values(s.units).filter(u => u.ownerId === 0),
        ...Object.values(s.cities).filter(c => c.ownerId === 0)
    ];

    for (const uid of Object.keys(s.units)) {
        const u = s.units[uid];
        if (u.ownerId !== pid || u.actionsDone || u.movement <= 0) continue;

        if (u.type === 'SETTLER') {
            const tooClose = Object.values(s.cities).some(c => {
                const dq = c.q - u.q, dr = c.r - u.r;
                const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
                return dist < 4;
            });
            const tile = s.tiles[`${u.q},${u.r}`];
            if (tile && !tile.hasCity && !tooClose && !['OCEAN', 'MOUNTAIN'].includes(tile.terrain)) {
                s = foundCity(s, uid);
            } else {
                // If too close, move away
                if (tooClose) {
                    const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
                    const bestStep = dirs.map(dir => ({ q: u.q + dir[0], r: u.r + dir[1] }))
                        .filter(c => s.tiles[`${c.q},${c.r}`] && !['OCEAN', 'MOUNTAIN', 'ICE'].includes(s.tiles[`${c.q},${c.r}`].terrain))
                        .sort((a, b) => {
                            // Maximize distance from nearest city
                            const distFromCity = (pos: { q: number, r: number }) => Math.min(...Object.values(s.cities).map(c =>
                                Math.max(Math.abs(c.q - pos.q), Math.abs(c.r - pos.r), Math.abs(-(c.q - pos.q) - (c.r - pos.r)))
                            ));
                            return distFromCity(b) - distFromCity(a);
                        })[0];
                    if (bestStep) s = moveUnit(s, uid, bestStep.q, bestStep.r);
                    else s = autoExplore(s, uid);
                } else {
                    s = autoExplore(s, uid);
                }
            }
        } else {
            // Combat Unit / Barbarian
            const enemyTargets = [
                ...Object.values(s.units).filter(ent => ent.ownerId !== pid),
                ...Object.values(s.cities).filter(enc => enc.ownerId !== pid)
            ];

            if (enemyTargets.length > 0) {
                const target = enemyTargets.sort((a, b) => {
                    const d1 = Math.max(Math.abs(a.q - u.q), Math.abs(a.r - u.r), Math.abs(-(a.q - u.q) - (a.r - u.r)));
                    const d2 = Math.max(Math.abs(b.q - u.q), Math.abs(b.r - u.r), Math.abs(-(b.q - u.q) - (b.r - u.r)));
                    return d1 - d2;
                })[0];

                const d = Math.max(Math.abs(target.q - u.q), Math.abs(target.r - u.r), Math.abs(-(target.q - u.q) - (target.r - u.r)));
                if (d === 1) {
                    s = moveUnit(s, uid, target.q, target.r);
                } else {
                    const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
                    const bestStep = dirs.map(dir => ({ q: u.q + dir[0], r: u.r + dir[1] }))
                        .filter(c => s.tiles[`${c.q},${c.r}`] && !['OCEAN', 'MOUNTAIN'].includes(s.tiles[`${c.q},${c.r}`].terrain))
                        .sort((a, b) => {
                            const da = Math.max(Math.abs(a.q - target.q), Math.abs(a.r - target.r), Math.abs(-(a.q - target.q) - (a.r - target.r)));
                            const db = Math.max(Math.abs(b.q - target.q), Math.abs(b.r - target.r), Math.abs(-(b.q - target.q) - (b.r - target.r)));
                            return da - db;
                        })[0];
                    if (bestStep) s = moveUnit(s, uid, bestStep.q, bestStep.r);
                    else s.units[uid] = { ...u, actionsDone: true };
                }
            } else {
                s = autoExplore(s, uid);
            }
        }
    }
    return s;
}

export function setResearch(state: GameState, playerId: number, tech: TechType): GameState {
    const player = { ...state.players[playerId], science: { ...state.players[playerId].science, researching: tech } };
    return { ...state, players: { ...state.players, [playerId]: player } };
}

export function enqueueProduction(state: GameState, cityId: string, itemType: 'UNIT' | 'BUILDING' | 'WONDER', itemId: string): GameState {
    const city = { ...state.cities[cityId], productionQueue: [...state.cities[cityId].productionQueue, { type: itemType, id: itemId }] };
    return { ...state, cities: { ...state.cities, [cityId]: city } };
}

const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];

function keyOf(q: number, r: number) {
    return `${q},${r}`;
}

function hexDist(aq: number, ar: number, bq: number, br: number) {
    const dq = bq - aq;
    const dr = br - ar;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
}

function isPassableForUnit(tile: TileData | undefined, unit: Unit) {
    if (!tile) return false;
    if (tile.terrain === 'MOUNTAIN') return false;
    if (tile.terrain === 'OCEAN') return false;
    return true;
}

function moveCost(tile: TileData) {
    // Very lightweight Civ-like costs (no roads yet)
    // Base 1; rough terrain costs 2.
    if (tile.feature === 'HILL') return 2;
    if (tile.feature === 'FOREST') return 2;
    if (tile.feature === 'JUNGLE') return 2;
    if (tile.feature === 'MARSH') return 2;
    if (tile.feature === 'RIVER') return 2;
    return 1;
}

function findPathWithinMovement(state: GameState, unit: Unit, dstQ: number, dstR: number): { path: { q: number, r: number }[]; totalCost: number } | null {
    const startKey = keyOf(unit.q, unit.r);
    const goalKey = keyOf(dstQ, dstR);
    if (startKey === goalKey) return { path: [], totalCost: 0 };

    // Dijkstra (costs are 1/2). Keep it simple.
    const frontier: { k: string; q: number; r: number; cost: number }[] = [{ k: startKey, q: unit.q, r: unit.r, cost: 0 }];
    const bestCost = new Map<string, number>([[startKey, 0]]);
    const cameFrom = new Map<string, string>();

    const isBlockedByUnit = (q: number, r: number) => {
        const occ = Object.values(state.units).find(u => u.q === q && u.r === r);
        if (!occ) return false;
        // Can't path through any unit; destination handling is done by caller.
        return true;
    };

    while (frontier.length > 0) {
        frontier.sort((a, b) => a.cost - b.cost);
        const curr = frontier.shift()!;
        if (curr.k === goalKey) break;

        for (const [dq, dr] of HEX_DIRS) {
            const nq = curr.q + dq;
            const nr = curr.r + dr;
            const nk = keyOf(nq, nr);
            if (nk !== goalKey && isBlockedByUnit(nq, nr)) continue;

            const tile = state.tiles[nk];
            if (!isPassableForUnit(tile, unit)) continue;

            const stepCost = moveCost(tile);
            const nextCost = curr.cost + stepCost;
            const prevBest = bestCost.get(nk);
            if (prevBest !== undefined && nextCost >= prevBest) continue;
            if (nextCost > unit.movement) continue;

            bestCost.set(nk, nextCost);
            cameFrom.set(nk, curr.k);
            frontier.push({ k: nk, q: nq, r: nr, cost: nextCost });
        }
    }

    if (!bestCost.has(goalKey)) return null;

    const rev: string[] = [goalKey];
    while (rev[rev.length - 1] !== startKey) {
        const prev = cameFrom.get(rev[rev.length - 1]);
        if (!prev) return null;
        rev.push(prev);
    }
    rev.reverse();

    const path = rev.slice(1).map(k => {
        const [qStr, rStr] = k.split(',');
        return { q: Number(qStr), r: Number(rStr) };
    });
    const totalCost = bestCost.get(goalKey)!;
    return { path, totalCost };
}

export function rangedAttack(state: GameState, attackerId: string, targetQ: number, targetR: number): GameState {
    const attacker = state.units[attackerId];
    if (!attacker) return state;
    const def = UNIT_DEFS[attacker.type];
    if (!def?.isRanged) return state;
    if (attacker.actionsDone || attacker.hasAttacked) return state;
    if (def.range <= 0) return state;

    const d = hexDist(attacker.q, attacker.r, targetQ, targetR);
    if (d <= 0 || d > def.range) return state;

    const targetUnit = Object.values(state.units).find(u => u.q === targetQ && u.r === targetR);
    const targetCity = Object.values(state.cities).find(c => c.q === targetQ && c.r === targetR);
    if (targetUnit && targetUnit.ownerId === attacker.ownerId) return state;
    if (targetCity && targetCity.ownerId === attacker.ownerId) return state;
    if (!targetUnit && !targetCity) return state;

    const newUnits = { ...state.units };
    const newCities = { ...state.cities };

    // Simple ranged damage model (placeholder, but consistent)
    const base = Math.max(2, Math.floor(attacker.combat * (0.8 + Math.random() * 0.4)));

    if (targetUnit) {
        const updated = { ...targetUnit, hp: targetUnit.hp - base };
        if (updated.hp <= 0) delete newUnits[targetUnit.id];
        else newUnits[targetUnit.id] = updated;
    } else if (targetCity) {
        const updated = { ...targetCity, hp: Math.max(0, targetCity.hp - Math.floor(base * 0.7)) };
        newCities[targetCity.id] = updated;
    }

    newUnits[attackerId] = { ...attacker, movement: 0, actionsDone: true, hasAttacked: true };

    let next = { ...state, units: newUnits, cities: newCities };
    next = updateRevealedTiles(next, attacker.ownerId);
    next = calculatePlayerYields(next, attacker.ownerId);
    return next;
}

export function moveUnit(state: GameState, unitId: string, dstQ: number, dstR: number): GameState {
    const unit = state.units[unitId];
    if (!unit || unit.movement <= 0) return state;

    // If destination is far, try pathfinding and move as far as allowed.
    // This preserves existing behavior for adjacent attacks/captures.
    const dist = hexDist(unit.q, unit.r, dstQ, dstR);
    if (dist > 1) {
        const occ = Object.values(state.units).find(u => u.q === dstQ && u.r === dstR);
        if (occ && occ.ownerId !== unit.ownerId) return state; // melee can't "move onto" a distant enemy
        const cityOnDst = Object.values(state.cities).find(c => c.q === dstQ && c.r === dstR);
        if (cityOnDst && cityOnDst.ownerId !== unit.ownerId) return state; // melee city attack must be adjacent
        const route = findPathWithinMovement(state, unit, dstQ, dstR);
        if (!route) return state;
        // Walk the path (it is already within movement, and avoids other units)
        const last = route.path[route.path.length - 1];
        if (!last) return state;
        let nextState = {
            ...state,
            units: {
                ...state.units,
                [unitId]: { ...unit, q: last.q, r: last.r, s: -last.q - last.r, movement: Math.max(0, unit.movement - route.totalCost) }
            }
        };
        nextState = updateRevealedTiles(nextState, unit.ownerId);
        nextState = calculatePlayerYields(nextState, unit.ownerId);
        return nextState;
    }

    const occupied = Object.values(state.units).find(u => u.q === dstQ && u.r === dstR && u.id !== unitId);
    if (occupied) {
        if (occupied.ownerId === unit.ownerId) return state; // friendly block
        // Combat!
        const newUnits = { ...state.units };
        const dmgToTarget = Math.max(1, Math.floor(unit.combat * (0.7 + Math.random() * 0.6)));
        const dmgToAttacker = Math.max(1, Math.floor(occupied.combat * (0.4 + Math.random() * 0.4)));

        const newTarget = { ...occupied, hp: occupied.hp - dmgToTarget };
        const newAttacker = { ...unit, hp: unit.hp - dmgToAttacker, movement: 0, hasAttacked: true, actionsDone: true };

        if (newTarget.hp <= 0) {
            delete newUnits[occupied.id];
            // Advance into killed unit's square
            newUnits[unitId] = { ...newAttacker, q: dstQ, r: dstR, s: -dstQ - dstR };
        } else {
            newUnits[occupied.id] = newTarget;
            newUnits[unitId] = newAttacker;
        }
        if (newAttacker.hp <= 0) delete newUnits[unitId];

        let nextState = { ...state, units: newUnits };
        nextState = updateRevealedTiles(nextState, unit.ownerId);
        return nextState;
    }

    // Attack city!
    const enemyCity = Object.values(state.cities).find(c => c.q === dstQ && c.r === dstR && c.ownerId !== unit.ownerId);
    if (enemyCity && enemyCity.hp > 0) {
        const dmg = Math.max(1, Math.floor(unit.combat * 0.5));
        const newCity = { ...enemyCity, hp: Math.max(0, enemyCity.hp - dmg) };
        const newAttacker = { ...unit, hp: unit.hp - 2, movement: 0, actionsDone: true };

        let nextState = {
            ...state,
            cities: { ...state.cities, [enemyCity.id]: newCity },
            units: { ...state.units, [unitId]: newAttacker }
        };
        if (newAttacker.hp <= 0) delete nextState.units[unitId];
        nextState = updateRevealedTiles(nextState, unit.ownerId);
        return nextState;
    }

    const tile = state.tiles[`${dstQ},${dstR}`];
    if (!tile || ['OCEAN', 'MOUNTAIN'].includes(tile.terrain)) return state;

    let nextState = {
        ...state,
        units: { ...state.units, [unitId]: { ...unit, q: dstQ, r: dstR, s: -dstQ - dstR, movement: Math.max(0, unit.movement - moveCost(tile)) } },
    };

    // Capture City if combat unit enters unhosted enemy city or defeated city
    const city = Object.values(nextState.cities).find(c => c.q === dstQ && c.r === dstR);
    if (city && city.ownerId !== unit.ownerId && unit.type !== 'SETTLER' && city.hp <= 0) {
        // Capture logic
        const newCity = { ...city, ownerId: unit.ownerId, hp: Math.floor(city.maxHp / 2) };
        nextState = {
            ...nextState,
            cities: { ...nextState.cities, [city.id]: newCity }
        };
        // Transfer border ownership of city tile and simple surrounding
        const newTiles = { ...nextState.tiles };
        const dirs = [[0, 0], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
        dirs.forEach(d => {
            const nq = city.q + d[0], nr = city.r + d[1];
            const nk = `${nq},${nr}`;
            if (newTiles[nk] && newTiles[nk].borderOwnerId === city.ownerId) {
                newTiles[nk] = { ...newTiles[nk], borderOwnerId: unit.ownerId };
            }
        });
        nextState = { ...nextState, tiles: newTiles };
        nextState = calculatePlayerYields(nextState, unit.ownerId); // Recalculate yields for new owner
        nextState = calculatePlayerYields(nextState, city.ownerId); // Recalculate yields for old owner
    }

    nextState = updateRevealedTiles(nextState, unit.ownerId);
    nextState = calculatePlayerYields(nextState, unit.ownerId);

    return nextState;
}

export function foundCity(state: GameState, unitId: string, customId?: string): GameState {
    const unit = state.units[unitId];
    if (!unit || unit.type !== 'SETTLER') return state;
    const key = `${unit.q},${unit.r}`;
    const tile = state.tiles[key];
    if (!tile || tile.hasCity || (tile.borderOwnerId !== null && tile.borderOwnerId !== unit.ownerId)) return state;

    // Check distance from other cities (minimum 4 tiles)
    const tooClose = Object.values(state.cities).find(c => {
        const dq = c.q - unit.q;
        const dr = c.r - unit.r;
        return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) < 4;
    });
    if (tooClose) {
        // Return original state but maybe we should flag it
        return state;
    }

    const civKey = state.players[unit.ownerId]?.civKey;
    const civ = civKey ? civKey : 'Rome';
    const playerCityCount = Object.values(state.cities).filter(c => c.ownerId === unit.ownerId).length;
    const possibleNames = CITY_NAMES[civ] || ['New City'];
    let cityName = possibleNames[playerCityCount % possibleNames.length];

    // Ensure uniqueness if possible
    if (Object.values(state.cities).some(c => c.name === cityName)) {
        cityName = `${cityName} ${playerCityCount + 1}`;
    }

    const cityId = customId || `city_${unit.ownerId}_${Date.now()}_${Math.random()}`;

    const newCity: City = {
        id: cityId,
        name: cityName,
        ownerId: unit.ownerId,
        q: unit.q, r: unit.r,
        population: 1, food: 0, foodToGrow: 10,
        productionQueue: [],
        productionAccumulated: 0,
        buildings: [], wonders: [],
        yields: { food: 2, production: 1, gold: 1, science: 2, culture: 1 },
        hp: 100, maxHp: 100,
    };

    const nextTiles = { ...state.tiles };
    // Assign territory in radius 1
    const dirs = [[0, 0], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
    dirs.forEach(d => {
        const nq = unit.q + d[0], nr = unit.r + d[1];
        const nk = `${nq},${nr}`;
        if (nextTiles[nk]) {
            nextTiles[nk] = { ...nextTiles[nk], borderOwnerId: unit.ownerId };
        }
    });
    nextTiles[key] = { ...nextTiles[key], hasCity: true };

    const newUnits = { ...state.units };
    delete newUnits[unitId];

    const nextState = {
        ...state,
        units: newUnits,
        cities: { ...state.cities, [cityId]: newCity },
        tiles: nextTiles,
    };

    let finalState = updateRevealedTiles(nextState, unit.ownerId);
    finalState = calculatePlayerYields(finalState, unit.ownerId);

    return finalState;
}

export function improveTile(state: GameState, unitId: string, improvementType: string): GameState {
    const unit = state.units[unitId];
    if (!unit || unit.type !== 'WORKER' || unit.movement <= 0) return state;

    const key = `${unit.q},${unit.r}`;
    const tile = state.tiles[key];
    if (!tile || tile.terrain === 'MOUNTAIN' || tile.terrain === 'OCEAN') return state;
    if (tile.borderOwnerId !== unit.ownerId) return state;

    const nextState = {
        ...state,
        tiles: {
            ...state.tiles,
            [key]: { ...tile, improvement: improvementType }
        },
        units: {
            ...state.units,
            [unitId]: { ...unit, movement: 0, actionsDone: true }
        }
    };

    return calculatePlayerYields(nextState, unit.ownerId);
}

export function autoExplore(state: GameState, unitId: string): GameState {
    const u = state.units[unitId];
    if (!u || u.movement <= 0) return state;

    const player = state.players[u.ownerId];
    const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];

    // 1. Check adjacent unrevealed
    const adjacent = dirs.map(d => ({ q: u.q + d[0], r: u.r + d[1] }))
        .filter(c => {
            const tk = `${c.q},${c.r}`;
            return state.tiles[tk] && !player.revealedTiles.includes(tk) && state.tiles[tk].terrain !== 'OCEAN' && state.tiles[tk].terrain !== 'MOUNTAIN';
        });

    if (adjacent.length > 0) {
        const pick = adjacent[Math.floor(Math.random() * adjacent.length)];
        return moveUnit(state, unitId, pick.q, pick.r);
    }

    // 2. BFS for nearest unrevealed land tile
    const queue: { q: number, r: number, dist: number }[] = [{ q: u.q, r: u.r, dist: 0 }];
    const visited = new Set<string>();
    visited.add(`${u.q},${u.r}`);
    let target = null;

    while (queue.length > 0 && queue[0].dist < 15) {
        const curr = queue.shift()!;
        for (const [dq, dr] of dirs) {
            const nq = curr.q + dq, nr = curr.r + dr;
            const nk = `${nq},${nr}`;
            if (!state.tiles[nk] || visited.has(nk)) continue;
            visited.add(nk);

            if (!player.revealedTiles.includes(nk)) {
                if (state.tiles[nk].terrain !== 'OCEAN' && state.tiles[nk].terrain !== 'MOUNTAIN') {
                    target = { q: nq, r: nr };
                    break;
                }
            }
            queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
        }
        if (target) break;
    }

    if (target) {
        // Find adjacent hex that brings us closer to target
        const bestStep = dirs.map(d => ({ q: u.q + d[0], r: u.r + d[1] }))
            .filter(c => {
                const tk = `${c.q},${c.r}`;
                const t = state.tiles[tk];
                return t && t.terrain !== 'OCEAN' && t.terrain !== 'MOUNTAIN' && !Object.values(state.units).some(ou => ou.q === c.q && ou.r === c.r);
            })
            .sort((a, b) => {
                const distA = Math.max(Math.abs(a.q - target!.q), Math.abs(a.r - target!.r), Math.abs(-(a.q - target!.q) - (a.r - target!.r)));
                const distB = Math.max(Math.abs(b.q - target!.q), Math.abs(b.r - target!.r), Math.abs(-(b.q - target!.q) - (b.r - target!.r)));
                return distA - distB;
            })[0];

        if (bestStep) return moveUnit(state, unitId, bestStep.q, bestStep.r);
    }

    // 3. Fallback: random move
    const randomCandidates = dirs.map(d => ({ q: u.q + d[0], r: u.r + d[1] }))
        .filter(c => {
            const tk = `${c.q},${c.r}`;
            const t = state.tiles[tk];
            return t && t.terrain !== 'OCEAN' && t.terrain !== 'MOUNTAIN' && !Object.values(state.units).some(ou => ou.q === c.q && ou.r === c.r);
        });

    if (randomCandidates.length > 0) {
        const pick = randomCandidates[Math.floor(Math.random() * randomCandidates.length)];
        return moveUnit(state, unitId, pick.q, pick.r);
    }

    return state;
}

export function autoImprove(state: GameState, unitId: string): GameState {
    const u = state.units[unitId];
    if (!u || u.type !== 'WORKER' || u.movement <= 0) return state;

    const key = `${u.q},${u.r}`;
    const tile = state.tiles[key];

    // If we're on a tile we own and no improvement, build one
    if (tile && tile.borderOwnerId === u.ownerId && !tile.improvement && !tile.hasCity) {
        let improvement = '';
        if (tile.resource === 'WHEAT' || tile.terrain === 'GRASSLAND' || tile.terrain === 'PLAINS') improvement = 'FARM';
        else if (tile.resource === 'IRON' || tile.resource === 'GOLD_ORE' || tile.resource === 'GEMS') improvement = 'MINE';

        if (improvement) return improveTile(state, unitId, improvement);
    }

    // Otherwise move to nearest unimproved owned tile
    const ownedTiles = Object.values(state.tiles).filter(t => t.borderOwnerId === u.ownerId && !t.improvement && !t.hasCity);
    if (ownedTiles.length > 0) {
        // Sort by distance
        const nearest = ownedTiles.sort((a, b) => {
            const d1 = Math.max(Math.abs(a.q - u.q), Math.abs(a.r - u.r), Math.abs(-(a.q - u.q) - (a.r - u.r)));
            const d2 = Math.max(Math.abs(b.q - u.q), Math.abs(b.r - u.r), Math.abs(-(b.q - u.q) - (b.r - u.r)));
            return d1 - d2;
        })[0];

        // Pathfinding is complex, just move 1 step towards it for simplicity
        const dq = nearest.q - u.q, dr = nearest.r - u.r;
        const stepQ = u.q + (dq !== 0 ? Math.sign(dq) : 0);
        const stepR = u.r + (dq === 0 ? Math.sign(dr) : 0);
        return moveUnit(state, unitId, stepQ, stepR);
    }

    // If nothing to improve, fallback to explore
    return autoExplore(state, unitId);
}
