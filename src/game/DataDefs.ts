import type { Resources, UnitType } from './GameTypes';

export const UNIT_DEFS: Record<UnitType, { cost: number; combat: number; movement: number; range: number; isRanged: boolean; prerequisiteTech?: string }> = {
    SETTLER: { cost: 80, combat: 0, movement: 2, range: 0, isRanged: false },
    WARRIOR: { cost: 40, combat: 8, movement: 2, range: 0, isRanged: false },
    ARCHER: { cost: 55, combat: 5, movement: 2, range: 2, isRanged: true, prerequisiteTech: 'ARCHERY' },
    WORKER: { cost: 35, combat: 0, movement: 2, range: 0, isRanged: false },
    SCOUT: { cost: 25, combat: 4, movement: 3, range: 0, isRanged: false },
    SWORDSMAN: { cost: 75, combat: 14, movement: 2, range: 0, isRanged: false, prerequisiteTech: 'BRONZE_WORKING' },
    CATAPULT: { cost: 100, combat: 7, movement: 2, range: 2, isRanged: true, prerequisiteTech: 'MATHEMATICS' },
};

export type BuildingType = 'MONUMENT' | 'GRANARY' | 'LIBRARY' | 'SHRINE' | 'BARRACKS' | 'MARKET';
export const BUILDING_DEFS: Record<BuildingType, { cost: number; yields: Partial<Resources>; prerequisiteTech?: string }> = {
    MONUMENT: { cost: 40, yields: { culture: 2 } },
    SHRINE: { cost: 40, yields: { gold: 1, culture: 1 }, prerequisiteTech: 'POTTERY' },
    GRANARY: { cost: 60, yields: { food: 3 }, prerequisiteTech: 'POTTERY' },
    LIBRARY: { cost: 75, yields: { science: 4 }, prerequisiteTech: 'WRITING' },
    BARRACKS: { cost: 75, yields: { production: 2 }, prerequisiteTech: 'BRONZE_WORKING' },
    MARKET: { cost: 80, yields: { gold: 3 }, prerequisiteTech: 'WRITING' },
};

export type TechType = 'AGRICULTURE' | 'POTTERY' | 'ANIMAL_HUSBANDRY' | 'ARCHERY' | 'MINING' | 'WRITING' | 'BRONZE_WORKING' | 'IRON_WORKING' | 'MATHEMATICS';
export const TECH_DEFS: Record<TechType, { cost: number; prereqs: TechType[]; unlocks: string[]; era: string }> = {
    AGRICULTURE: { cost: 20, prereqs: [], unlocks: ['FARM', 'Worker Improvement'], era: 'Ancient' },
    POTTERY: { cost: 35, prereqs: ['AGRICULTURE'], unlocks: ['GRANARY', 'SHRINE'], era: 'Ancient' },
    ANIMAL_HUSBANDRY: { cost: 35, prereqs: ['AGRICULTURE'], unlocks: ['HORSES Resource'], era: 'Ancient' },
    ARCHERY: { cost: 35, prereqs: ['AGRICULTURE'], unlocks: ['ARCHER'], era: 'Ancient' },
    MINING: { cost: 35, prereqs: ['AGRICULTURE'], unlocks: ['MINE'], era: 'Ancient' },
    WRITING: { cost: 55, prereqs: ['POTTERY'], unlocks: ['LIBRARY', 'MARKET'], era: 'Classical' },
    BRONZE_WORKING: { cost: 55, prereqs: ['MINING'], unlocks: ['BARRACKS', 'SWORDSMAN'], era: 'Classical' },
    IRON_WORKING: { cost: 80, prereqs: ['BRONZE_WORKING'], unlocks: ['IRON Resource', 'SWORDSMAN++'], era: 'Classical' },
    MATHEMATICS: { cost: 80, prereqs: ['WRITING', 'IRON_WORKING'], unlocks: ['CATAPULT'], era: 'Classical' },
};

export type WonderType = 'PYRAMIDS' | 'STONEHENGE' | 'GREAT_WALL';
export const WONDER_DEFS: Record<WonderType, { cost: number; effect: string; prerequisiteTech: string }> = {
    PYRAMIDS: { cost: 180, effect: '+100% production speed for Workers', prerequisiteTech: 'MINING' },
    STONEHENGE: { cost: 120, effect: '+4 Culture per turn, +1 Great Prophet', prerequisiteTech: 'POTTERY' },
    GREAT_WALL: { cost: 160, effect: 'Enemy land units -50% XP near borders', prerequisiteTech: 'MINING' },
};

export type ProductionItemDef = { type: 'UNIT', id: UnitType } | { type: 'BUILDING', id: BuildingType } | { type: 'WONDER', id: WonderType };
