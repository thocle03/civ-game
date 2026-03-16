export type PlayerId = number;

export type TerrainType = 'OCEAN' | 'COAST' | 'GRASSLAND' | 'PLAINS' | 'DESERT' | 'TUNDRA' | 'SNOW' | 'MOUNTAIN';
export type FeatureType = 'NONE' | 'FOREST' | 'JUNGLE' | 'MARSH' | 'OASIS' | 'HILL' | 'RIVER';
export type ResourceType = 'WHEAT' | 'HORSES' | 'IRON' | 'GOLD_ORE' | 'GEMS' | 'FISH' | 'DEER' | 'OIL' | 'COTTON' | 'SILK';

export interface Resources {
    food: number;
    production: number;
    gold: number;
    science: number;
    culture: number;
}

export interface TileData {
    q: number;
    r: number;
    s: number;
    terrain: TerrainType;
    feature: FeatureType;
    resource: ResourceType | null;
    ownerId: PlayerId | null;
    improvement: string | null;
    hasCity: boolean;
    riverEdges?: number[]; // edge indices with rivers
    borderOwnerId: number | null;
}

export type UnitType = 'SETTLER' | 'WARRIOR' | 'ARCHER' | 'WORKER' | 'SCOUT' | 'SWORDSMAN' | 'CATAPULT';
export type BuildingType = 'MONUMENT' | 'GRANARY' | 'LIBRARY' | 'SHRINE' | 'BARRACKS' | 'MARKET';
export type TechType = 'AGRICULTURE' | 'POTTERY' | 'ANIMAL_HUSBANDRY' | 'ARCHERY' | 'MINING' | 'WRITING' | 'BRONZE_WORKING' | 'IRON_WORKING' | 'MATHEMATICS';
export type WonderType = 'PYRAMIDS' | 'STONEHENGE' | 'GREAT_WALL';

export interface Unit {
    id: string;
    type: UnitType;
    ownerId: PlayerId;
    q: number;
    r: number;
    hp: number;
    maxHp: number;
    combat: number;
    movement: number;
    maxMovement: number;
    actionsDone: boolean;
    hasAttacked: boolean;
    automation?: 'EXPLORE' | 'IMPROVE' | null;
}

export interface ProductionItem {
    type: 'UNIT' | 'BUILDING' | 'WONDER';
    id: string;
}

export interface City {
    id: string;
    name: string;
    ownerId: PlayerId;
    q: number;
    r: number;
    population: number;
    food: number;
    foodToGrow: number;
    productionQueue: ProductionItem[];
    productionAccumulated: number;
    buildings: BuildingType[];
    wonders: WonderType[];
    yields: Resources;
}

export interface TechState {
    unlocked: TechType[];
    researching: TechType | null;
    progress: number;
}

export interface Player {
    id: PlayerId;
    name: string;
    civilizationName: string;
    isAI: boolean;
    color: string;
    globalYields: Resources;
    science: TechState;
    gold: number;
    culture: number;
    happiness: number;
    era: string;
}

export interface GameState {
    turn: number;
    currentPlayerIndex: number;
    players: Record<PlayerId, Player>;
    tiles: Record<string, TileData>;
    units: Record<string, Unit>;
    cities: Record<string, City>;
    mapRadius: number;
}
