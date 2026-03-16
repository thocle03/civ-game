import type { GameState, TechType, UnitType, BuildingType } from './GameTypes';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS } from './DataDefs';
import { generateMap } from './MapGenerator';
import { getBaseTileYields } from './YieldLogic';

const CIVS = [
    { name: 'Rome', color: '#e74c3c', civName: 'Roman Empire' },
    { name: 'Egypt', color: '#f39c12', civName: 'Egyptian Empire' },
    { name: 'China', color: '#2ecc71', civName: 'Chinese Empire' },
    { name: 'Greece', color: '#3498db', civName: 'Greek Empire' },
    { name: 'India', color: '#9b59b6', civName: 'Indian Empire' },
    { name: 'Aztec', color: '#1abc9c', civName: 'Aztec Empire' },
];

export function initializeGame(numPlayers: number): GameState {
    const tiles = generateMap();
    const players: GameState['players'] = {};
    const units: GameState['units'] = {};
    const cities: GameState['cities'] = {};

    const keys = Object.keys(tiles);
    const landKeys = keys.filter(k => !['OCEAN', 'COAST', 'MOUNTAIN'].includes(tiles[k].terrain));

    for (let i = 0; i < numPlayers; i++) {
        const civ = CIVS[i % CIVS.length];
        players[i] = {
            id: i,
            name: i === 0 ? 'You' : civ.name,
            civilizationName: civ.civName,
            isAI: i > 0,
            color: civ.color,
            globalYields: { food: 0, production: 0, gold: 0, science: 5, culture: 2 },
            science: { unlocked: [], researching: 'AGRICULTURE', progress: 0 },
            gold: 0, culture: 0, happiness: 10,
            era: 'Ancient',
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
        units[sid] = { id: sid, type: 'SETTLER', ownerId: i, q, r, hp: 10, maxHp: 10, combat: 0, movement: 2, maxMovement: 2, actionsDone: false, hasAttacked: false };
        const wid = `unit_${i}_warrior`;
        // Place warrior on adjacent tile
        units[wid] = { id: wid, type: 'WARRIOR', ownerId: i, q: q + 1, r, hp: 10, maxHp: 10, combat: UNIT_DEFS['WARRIOR'].combat, movement: 2, maxMovement: 2, actionsDone: false, hasAttacked: false };
    }

    return { turn: 1, currentPlayerIndex: 0, players, tiles, units, cities, mapRadius: 22 };
}

export function calculateCityYields(state: GameState, cityId: string) {
    const city = state.cities[cityId];
    const player = state.players[city.ownerId];

    // Start with base city square (free)
    const cityTile = state.tiles[`${city.q},${city.r}`];
    let yields = getBaseTileYields(cityTile.terrain, cityTile.feature, cityTile.resource, cityTile.improvement);
    // Cities always have at least 2 food, 1 prod
    yields.food = Math.max(yields.food, 2);
    yields.production = Math.max(yields.production, 1);

    // Add building yields
    city.buildings.forEach(bId => {
        const bDef = BUILDING_DEFS[bId];
        if (bDef.yields.food) yields.food += bDef.yields.food;
        if (bDef.yields.production) yields.production += bDef.yields.production;
        if (bDef.yields.gold) yields.gold += bDef.yields.gold;
        if (bDef.yields.science) yields.science += bDef.yields.science;
        if (bDef.yields.culture) yields.culture += bDef.yields.culture;
    });

    // Work tiles: find all tiles in city's borders
    const ownedTiles = Object.values(state.tiles).filter(t => t.borderOwnerId === city.ownerId);
    // Sort by total value (naive)
    const scoredTiles = ownedTiles.map(t => ({
        t,
        score: getBaseTileYields(t.terrain, t.feature, t.resource, t.improvement).food * 2 +
            getBaseTileYields(t.terrain, t.feature, t.resource, t.improvement).production * 2 +
            getBaseTileYields(t.terrain, t.feature, t.resource, t.improvement).gold
    })).sort((a, b) => b.score - a.score);

    // Number of worked tiles = population
    for (let i = 0; i < Math.min(city.population, scoredTiles.length); i++) {
        const t = scoredTiles[i].t;
        if (t.q === city.q && t.r === city.r) continue; // City square already added
        const ty = getBaseTileYields(t.terrain, t.feature, t.resource, t.improvement);
        yields.food += ty.food;
        yields.production += ty.production;
        yields.gold += ty.gold;
        yields.science += ty.science;
        yields.culture += ty.culture;
    }

    city.yields = yields;
}

export function calculatePlayerYields(state: GameState, playerId: number) {
    const player = state.players[playerId];
    const total = { food: 0, production: 0, gold: 0, science: 5, culture: 2 };

    Object.keys(state.cities).forEach(cid => {
        if (state.cities[cid].ownerId === playerId) {
            calculateCityYields(state, cid);
            const cy = state.cities[cid].yields;
            total.food += cy.food;
            total.production += cy.production;
            total.gold += cy.gold;
            total.science += cy.science;
            total.culture += cy.culture;
        }
    });

    player.globalYields = total;
}

export function endTurn(state: GameState): GameState {
    const nextState: GameState = {
        ...state,
        players: { ...state.players },
        tiles: { ...state.tiles },
        units: { ...state.units },
        cities: { ...state.cities },
    };
    const pid = nextState.currentPlayerIndex;
    const player = { ...nextState.players[pid] };
    nextState.players[pid] = player;

    calculatePlayerYields(nextState, pid);

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
                        id: uid, type: item.id as UnitType, ownerId: pid, q: city.q, r: city.r,
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
    Object.values(nextState.cities).filter(c => c.ownerId === pid).forEach(city => {
        const ownedByThisCity = Object.values(nextState.tiles).filter(t => t.borderOwnerId === pid); // Simplified
        const borderCost = 10 + Math.floor(ownedByThisCity.length * 0.8);
        if (player.culture >= borderCost) {
            const candidates = new Set<string>();
            ownedByThisCity.forEach(ot => {
                const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
                dirs.forEach(d => {
                    const nk = `${ot.q + d[0]},${ot.r + d[1]}`;
                    if (nextState.tiles[nk] && nextState.tiles[nk].borderOwnerId === null) candidates.add(nk);
                });
            });
            const candList = Array.from(candidates);
            if (candList.length > 0) {
                const pick = candList[Math.floor(Math.random() * candList.length)];
                nextState.tiles[pick] = { ...nextState.tiles[pick], borderOwnerId: pid };
                player.culture -= borderCost;
            }
        }
    });

    // Advance to next player
    nextState.currentPlayerIndex = (pid + 1) % Object.keys(nextState.players).length;
    if (nextState.currentPlayerIndex === 0) {
        nextState.turn++;
        // Reset all units
        for (const uid of Object.keys(nextState.units)) {
            const u = nextState.units[uid];
            nextState.units[uid] = { ...u, movement: u.maxMovement, actionsDone: false, hasAttacked: false };
        }
    }

    // Run AI or Automation
    if (nextState.players[nextState.currentPlayerIndex].isAI) {
        runAI(nextState, nextState.currentPlayerIndex);
    } else {
        // Run persistent automation for human player
        const automatedState = runAutomation(nextState, nextState.currentPlayerIndex);
        Object.assign(nextState.units, automatedState.units);
        Object.assign(nextState.tiles, automatedState.tiles);
    }

    return nextState;
}

export function runAutomation(state: GameState, playerId: number): GameState {
    let next = { ...state, units: { ...state.units } };
    for (const uid of Object.keys(next.units)) {
        const u = next.units[uid];
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

function runAI(state: GameState, pid: number) {
    const player = state.players[pid];
    if (!player.science.researching) {
        const available = (Object.keys(TECH_DEFS) as TechType[]).filter(
            t => !player.science.unlocked.includes(t) && TECH_DEFS[t].prereqs.every(p => player.science.unlocked.includes(p))
        );
        if (available.length) state.players[pid] = { ...player, science: { ...player.science, researching: available[0] } };
    }

    for (const cityId of Object.keys(state.cities)) {
        const city = state.cities[cityId];
        if (city.ownerId !== pid || city.productionQueue.length > 0) continue;
        city.productionQueue = [{ type: 'UNIT', id: 'WARRIOR' }];
    }

    for (const uid of Object.keys(state.units)) {
        const unit = state.units[uid];
        if (unit.ownerId !== pid || unit.actionsDone) continue;
        if (unit.type === 'SETTLER') {
            const key = `${unit.q},${unit.r}`;
            if (!state.tiles[key]?.hasCity) {
                const cityId = `city_${pid}_${Date.now()}`;
                state.cities[cityId] = {
                    id: cityId, name: `${CIVS[pid % CIVS.length].name} City`, ownerId: pid,
                    q: unit.q, r: unit.r, population: 1, food: 0, foodToGrow: 10,
                    productionQueue: [{ type: 'UNIT', id: 'WARRIOR' }], productionAccumulated: 0,
                    buildings: [], wonders: [],
                    yields: { food: 2, production: 2, gold: 1, science: 1, culture: 1 },
                };
                state.tiles[key] = { ...state.tiles[key], hasCity: true };
                delete state.units[uid];
            }
        } else {
            const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const nq = unit.q + dir[0], nr = unit.r + dir[1];
            const nk = `${nq},${nr}`;
            if (state.tiles[nk] && !['OCEAN', 'MOUNTAIN'].includes(state.tiles[nk].terrain)) {
                state.units[uid] = { ...unit, q: nq, r: nr, movement: 0, actionsDone: true };
            }
        }
    }
}

export function setResearch(state: GameState, playerId: number, tech: TechType): GameState {
    const player = { ...state.players[playerId], science: { ...state.players[playerId].science, researching: tech } };
    return { ...state, players: { ...state.players, [playerId]: player } };
}

export function enqueueProduction(state: GameState, cityId: string, itemType: 'UNIT' | 'BUILDING' | 'WONDER', itemId: string): GameState {
    const city = { ...state.cities[cityId], productionQueue: [...state.cities[cityId].productionQueue, { type: itemType, id: itemId }] };
    return { ...state, cities: { ...state.cities, [cityId]: city } };
}

export function moveUnit(state: GameState, unitId: string, dstQ: number, dstR: number): GameState {
    const unit = state.units[unitId];
    if (!unit || unit.movement <= 0) return state;

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
            newUnits[unitId] = { ...newAttacker, q: dstQ, r: dstR };
        } else {
            newUnits[occupied.id] = newTarget;
            newUnits[unitId] = newAttacker;
        }
        if (newAttacker.hp <= 0) delete newUnits[unitId];

        return { ...state, units: newUnits };
    }

    const tile = state.tiles[`${dstQ},${dstR}`];
    if (!tile || tile.terrain === 'OCEAN' || tile.terrain === 'MOUNTAIN') return state;

    return {
        ...state,
        units: { ...state.units, [unitId]: { ...unit, q: dstQ, r: dstR, movement: unit.movement - 1 } },
    };
}

export function foundCity(state: GameState, unitId: string): GameState {
    const unit = state.units[unitId];
    if (!unit || unit.type !== 'SETTLER') return state;
    const key = `${unit.q},${unit.r}`;
    if (state.tiles[key]?.hasCity) return state;

    const civ = CIVS[unit.ownerId % CIVS.length];
    const cityId = `city_${unit.ownerId}_${Date.now()}`;

    const newCity = {
        id: cityId,
        name: Object.values(state.cities).filter(c => c.ownerId === unit.ownerId).length === 0
            ? `${civ.name} (Capital)` : `${civ.name} City`,
        ownerId: unit.ownerId,
        q: unit.q, r: unit.r,
        population: 1, food: 0, foodToGrow: 10,
        productionQueue: [] as { type: 'UNIT' | 'BUILDING' | 'WONDER'; id: string }[],
        productionAccumulated: 0,
        buildings: [] as BuildingType[], wonders: [] as import('./GameTypes').WonderType[],
        yields: { food: 2, production: 1, gold: 1, science: 2, culture: 1 },
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

    // Force refresh yields
    calculatePlayerYields(nextState, unit.ownerId);

    return nextState;
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

    calculatePlayerYields(nextState, unit.ownerId);
    return nextState;
}

export function autoExplore(state: GameState, unitId: string): GameState {
    const next = { ...state, units: { ...state.units } };
    const u = next.units[unitId];
    if (!u || u.movement <= 0) return state;

    const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
    const candidates = dirs.map(d => ({ q: u.q + d[0], r: u.r + d[1] }))
        .filter(c => {
            const tk = `${c.q},${c.r}`;
            const t = state.tiles[tk];
            return t && t.terrain !== 'OCEAN' && t.terrain !== 'MOUNTAIN' && !Object.values(state.units).some(ou => ou.q === c.q && ou.r === c.r);
        });

    if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return moveUnit(next, unitId, pick.q, pick.r);
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
