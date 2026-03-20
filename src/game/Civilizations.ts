import type { Resources } from './GameTypes';

export type CivKey = 'Rome' | 'Egypt' | 'China' | 'Greece' | 'India' | 'Aztec';

export type CivDef = {
  key: CivKey;
  // Nom affiché pour l'interface
  playerName: string;
  civilizationName: string;
  color: string;
  // Bonus de départ (dans ce prototype, on les mappe sur globalYields)
  startingGlobalYields: Partial<Resources>;
};

export const CIV_DEFS: CivDef[] = [
  {
    key: 'Rome',
    playerName: 'Rome',
    civilizationName: 'Roman Empire',
    color: '#e74c3c',
    startingGlobalYields: { production: 2, culture: 1 },
  },
  {
    key: 'Egypt',
    playerName: 'Egypt',
    civilizationName: 'Egyptian Empire',
    color: '#f39c12',
    startingGlobalYields: { gold: 2, culture: 1 },
  },
  {
    key: 'China',
    playerName: 'China',
    civilizationName: 'Chinese Empire',
    color: '#2ecc71',
    startingGlobalYields: { science: 6, culture: 1 },
  },
  {
    key: 'Greece',
    playerName: 'Greece',
    civilizationName: 'Greek Empire',
    color: '#3498db',
    startingGlobalYields: { culture: 6, science: 2 },
  },
  {
    key: 'India',
    playerName: 'India',
    civilizationName: 'Indian Empire',
    color: '#9b59b6',
    startingGlobalYields: { food: 2, gold: 1, culture: 2 },
  },
  {
    key: 'Aztec',
    playerName: 'Aztec',
    civilizationName: 'Aztec Empire',
    color: '#1abc9c',
    startingGlobalYields: { production: 2, gold: 1, culture: 1 },
  },
];

export const CIV_KEYS: CivKey[] = CIV_DEFS.map(d => d.key);

export function getCivDef(key: CivKey | null | undefined): CivDef {
  const k = key ?? CIV_KEYS[0];
  return CIV_DEFS.find(d => d.key === k) ?? CIV_DEFS[0];
}

export function randomCivKey(): CivKey {
  return CIV_KEYS[Math.floor(Math.random() * CIV_KEYS.length)];
}

