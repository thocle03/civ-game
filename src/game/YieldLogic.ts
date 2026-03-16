import type { TerrainType, FeatureType, ResourceType, Resources } from './GameTypes';

export function getBaseTileYields(terrain: TerrainType, feature: FeatureType, resource: ResourceType | null, improvement: string | null = null): Resources {
    let y: Resources = { food: 0, production: 0, gold: 0, science: 0, culture: 0 };

    // Terrain Base
    switch (terrain) {
        case 'GRASSLAND': y.food = 2; break;
        case 'PLAINS': y.food = 1; y.production = 1; break;
        case 'DESERT': break;
        case 'TUNDRA': y.food = 1; break;
        case 'SNOW': break;
        case 'COAST': y.food = 1; y.gold = 1; break;
        case 'OCEAN': y.food = 1; break;
        case 'MOUNTAIN': break;
    }

    // Features
    switch (feature) {
        case 'FOREST': y.food = 1; y.production = 1; break; // Overrides base usually in Civ logic, but we'll add and cap
        case 'JUNGLE': y.food = 1; break;
        case 'HILL': y.production = 2; break;
        case 'OASIS': y.food = 3; y.gold = 1; break;
        case 'MARSH': y.food = -1; break;
    }

    // Resources
    if (resource) {
        switch (resource) {
            case 'WHEAT': y.food += 1; break;
            case 'FISH': y.food += 2; break;
            case 'DEER': y.production += 1; break;
            case 'IRON': y.production += 2; break;
            case 'HORSES': y.production += 1; break;
            case 'GOLD_ORE': y.gold += 3; break;
            case 'GEMS': y.gold += 3; y.culture += 1; break;
            case 'COTTON': y.gold += 2; break;
            case 'SILK': y.gold += 2; y.culture += 1; break;
        }
    }

    // Improvements
    if (improvement) {
        switch (improvement) {
            case 'FARM': y.food += 1; break;
            case 'MINE': y.production += 1; break;
            case 'TRADING_POST': y.gold += 2; break;
        }
    }

    return y;
}
