# Civilizations (prototype)

Dans cette reproduction, les civilisations sont choisies en multijoueur via le lobby (ou aléatoire).

## Bonus de civilisation (dans ce prototype)

Le prototype applique un **bonus de départ** sur les gains globaux (`globalYields`) de chaque joueur. Ce n'est pas encore 1:1 Civ V (pas de UU/UB complets, pas d'arbre de traditions), mais ça donne déjà des différences de style.

| Civ | Bonus de départ (globalYields) | Couleur |
|---|---|---|
| Rome | `production +2`, `culture +1` | #e74c3c |
| Egypt | `gold +2`, `culture +1` | #f39c12 |
| China | `science +6`, `culture +1` | #2ecc71 |
| Greece | `culture +6`, `science +2` | #3498db |
| India | `food +2`, `gold +1`, `culture +2` | #9b59b6 |
| Aztec | `production +2`, `gold +1`, `culture +1` | #1abc9c |

## Choisir une civilisation en multijoueur

1. Dans le lobby, chaque joueur voit une liste de civilisations + l'option **Random**.
2. Change ta civ à tout moment avant **Start game**.
3. Le host peut aussi configurer des **IA** (nombre et civ IA), puis lancer la partie.

## Modes lobby (host)

- **FOG** : vision par joueur (style Civ avec brouillard de guerre).
- **ALL_MAP_DEBUG** : mode test. Tout le monde voit toute la carte (utile pour debug et valider le gameplay / le placement des villes).

## À venir (pour se rapprocher de Civ V)

- UU/UB + effets spécifiques (pas seulement des bonus de départ)
- Diplomatie + négociations + politiques
- Vraies conditions de victoire (domination / science / etc.)
- Guerre plus Civ-like (frontières, terrain, bombardement plus fidèle)

