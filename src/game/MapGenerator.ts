import type { TileData, TerrainType, FeatureType, ResourceType } from './GameTypes';

const MAP_RADIUS = 22; // Larger map

export function generateMap(): Record<string, TileData> {
    const tiles: Record<string, TileData> = {};

    // Initialize with ocean
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
        const r1 = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
        const r2 = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
        for (let r = r1; r <= r2; r++) {
            tiles[`${q},${r}`] = {
                q, r, s: -q - r,
                terrain: 'OCEAN',
                feature: 'NONE',
                resource: null,
                ownerId: null,
                improvement: null,
                hasCity: false,
                borderOwnerId: null
            };
        }
    }

    // Create large continents using multi-pass expansion
    const landTiles = new Set<string>();
    const numContinents = 6;
    const seeds: [number, number][] = [];

    // Spread seeds around the map
    for (let i = 0; i < numContinents; i++) {
        const angle = (i / numContinents) * Math.PI * 2;
        const dist = MAP_RADIUS * 0.45;
        const sq = Math.round(dist * Math.cos(angle));
        const sr = Math.round(dist * Math.sin(angle));
        seeds.push([sq, sr]);
    }

    // Grow each continent via flood fill with randomness
    for (const [sq, sr] of seeds) {
        const key0 = `${sq},${sr}`;
        if (!tiles[key0]) continue;
        landTiles.add(key0);

        const frontier: [number, number][] = [[sq, sr]];
        const targetSize = 90 + Math.floor(Math.random() * 60); // 90-150 tiles per continent

        while (frontier.length > 0 && landTiles.size < seeds.indexOf([sq, sr]) * targetSize + targetSize) {
            const idx = Math.floor(Math.random() * frontier.length);
            const [cq, cr] = frontier[idx];
            frontier.splice(idx, 1);

            const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
            for (const [dq, dr] of dirs) {
                const nq = cq + dq, nr = cr + dr;
                const nk = `${nq},${nr}`;
                if (tiles[nk] && !landTiles.has(nk) && Math.random() < 0.7) {
                    landTiles.add(nk);
                    frontier.push([nq, nr]);
                    if (landTiles.size >= targetSize * (seeds.length)) break;
                }
            }
        }
    }

    // Second pass: grow each seed independently
    const continentSets: Set<string>[] = seeds.map((seed) => {
        const set = new Set<string>();
        const [sq, sr] = seed;
        const k = `${sq},${sr}`;
        if (!tiles[k]) return set;
        set.add(k);
        const frontier: [number, number][] = [[sq, sr]];
        const targetSize = 80 + Math.floor(Math.random() * 70);
        let steps = 0;

        while (frontier.length > 0 && set.size < targetSize) {
            steps++;
            if (steps > 5000) break;
            const idx = Math.floor(Math.random() * Math.min(frontier.length, 10));
            const [cq, cr] = frontier[idx];
            frontier.splice(idx, 1);

            const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
            for (const [dq, dr] of dirs) {
                const nq = cq + dq, nr = cr + dr;
                const nk = `${nq},${nr}`;
                if (tiles[nk] && !set.has(nk) && Math.random() < 0.75) {
                    set.add(nk);
                    frontier.push([nq, nr]);
                }
            }
        }
        return set;
    });

    // Combine all continents
    const allLand = new Set<string>();
    for (const s of continentSets) for (const k of s) allLand.add(k);

    // Assign terrain type based on distance from equator (latitude = r coord)
    for (const key of allLand) {
        const tile = tiles[key];
        if (!tile) continue;

        const latFrac = Math.abs(tile.r) / MAP_RADIUS; // 0 = equator, 1 = pole
        const rand = Math.random();
        let terrain: TerrainType = 'GRASSLAND';
        let feature: FeatureType = 'NONE';
        let resource: ResourceType | null = null;

        // Biome by latitude
        if (latFrac > 0.85) {
            terrain = rand < 0.5 ? 'SNOW' : 'TUNDRA';
        } else if (latFrac > 0.65) {
            terrain = rand < 0.6 ? 'TUNDRA' : 'PLAINS';
        } else if (latFrac < 0.2) {
            // Equatorial zone - tropical
            terrain = rand < 0.5 ? 'GRASSLAND' : rand < 0.75 ? 'PLAINS' : 'DESERT';
            if (terrain === 'GRASSLAND' && Math.random() < 0.5) feature = 'JUNGLE';
        } else {
            // Temperate
            if (rand < 0.1) terrain = 'DESERT';
            else if (rand < 0.45) terrain = 'PLAINS';
            else if (rand < 0.85) terrain = 'GRASSLAND';
            else terrain = 'MOUNTAIN';
        }

        // Features on non-mountain, non-desert
        if (terrain !== 'MOUNTAIN' && terrain !== 'DESERT' && terrain !== 'SNOW') {
            if (feature === 'NONE') {
                const fr = Math.random();
                if (fr < 0.22) feature = 'FOREST';
                else if (fr < 0.28 && terrain === 'PLAINS') feature = 'HILL';
            }
        } else if (terrain === 'DESERT' && Math.random() < 0.05) {
            feature = 'OASIS';
        }

        // Random resources
        if (Math.random() < 0.18) {
            const allResources: ResourceType[] = ['WHEAT', 'HORSES', 'IRON', 'GOLD_ORE', 'GEMS', 'DEER', 'COTTON', 'SILK'];
            const validFor: Partial<Record<TerrainType, ResourceType[]>> = {
                GRASSLAND: ['WHEAT', 'HORSES', 'COTTON', 'SILK'],
                PLAINS: ['WHEAT', 'HORSES', 'DEER'],
                DESERT: ['GOLD_ORE', 'GEMS', 'OIL'],
                TUNDRA: ['DEER', 'IRON', 'OIL'],
                MOUNTAIN: ['IRON', 'GOLD_ORE', 'GEMS'],
            };
            const possibleRes = (validFor[terrain] || allResources);
            resource = possibleRes[Math.floor(Math.random() * possibleRes.length)];
        }

        tile.terrain = terrain;
        tile.feature = feature;
        tile.resource = resource;
    }

    // Assign rivers to some land tiles near coasts
    for (const key of allLand) {
        const tile = tiles[key];
        if (!tile || tile.terrain === 'MOUNTAIN') continue;
        if (Math.random() < 0.07) {
            tile.feature = 'RIVER';
        }
    }

    // Mark coast tiles
    const dirs = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
    for (const key of Object.keys(tiles)) {
        if (tiles[key].terrain === 'OCEAN') {
            for (const [dq, dr] of dirs) {
                const nk = `${tiles[key].q + dq},${tiles[key].r + dr}`;
                if (tiles[nk] && !['OCEAN', 'COAST'].includes(tiles[nk].terrain)) {
                    tiles[key].terrain = 'COAST';
                    break;
                }
            }
        }
    }

    // Fish in coast/ocean
    for (const key of Object.keys(tiles)) {
        const tile = tiles[key];
        if ((tile.terrain === 'COAST') && Math.random() < 0.2) {
            tile.resource = 'FISH';
        }
    }

    return tiles;
}
