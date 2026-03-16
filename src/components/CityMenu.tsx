import React from 'react';
import type { City, UnitType, BuildingType } from '../game/GameTypes';
import { UNIT_DEFS, BUILDING_DEFS, WONDER_DEFS } from '../game/DataDefs';
import type { WonderType } from '../game/DataDefs';
import { XCircle } from 'lucide-react';

interface CityMenuProps {
    city: City;
    unlockedTechs: string[];
    onEnqueue: (type: 'UNIT' | 'BUILDING' | 'WONDER', id: string) => void;
    onClose: () => void;
}

export const CityMenu: React.FC<CityMenuProps> = ({ city, unlockedTechs, onEnqueue, onClose }) => {
    return (
        <div className="city-modal-overlay">
            <div className="modal-content">
                <button className="close-btn" onClick={onClose}><XCircle size={22} /></button>
                <h2>🏙️ {city.name} — Population {city.population}</h2>

                <div className="city-stats">
                    {[
                        ['🍎', 'Food', `${city.food}/${city.foodToGrow} (+${city.yields.food})`],
                        ['⚙️', 'Production', `${city.productionAccumulated} (+${city.yields.production})`],
                        ['🧪', 'Science', `+${city.yields.science}`],
                        ['💰', 'Gold', `+${city.yields.gold}`],
                        ['🎭', 'Culture', `+${city.yields.culture}`],
                    ].map(([icon, label, val]) => (
                        <div key={label as string} className="city-stat">{icon} <strong>{label}:</strong> {val}</div>
                    ))}
                </div>

                <div className="city-sections">
                    {/* Production queue */}
                    <div>
                        <div className="city-section-title">📋 Production Queue</div>
                        {city.productionQueue.length === 0 ? (
                            <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Queue is empty — choose something to build!</p>
                        ) : (
                            <ul className="queue-list">
                                {city.productionQueue.map((item, i) => {
                                    const cost = item.type === 'UNIT' ? UNIT_DEFS[item.id as UnitType].cost
                                        : item.type === 'BUILDING' ? BUILDING_DEFS[item.id as BuildingType].cost
                                            : WONDER_DEFS[item.id as WonderType].cost;
                                    return (
                                        <li key={i} className="queue-item">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                <span>{item.type === 'UNIT' ? '⚔️' : item.type === 'WONDER' ? '🏛️' : '🏗️'} {item.id.replace(/_/g, ' ')}</span>
                                                <span style={{ color: 'var(--muted)' }}>
                                                    {i === 0 ? `${Math.ceil(Math.max(0, cost - city.productionAccumulated) / (city.yields.production || 1))} turns` : `${cost}⚙️`}
                                                </span>
                                            </div>
                                            {i === 0 && (
                                                <div className="queue-progress">
                                                    <div className="queue-fill" style={{ width: `${Math.min(100, (city.productionAccumulated / cost) * 100)}%` }} />
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {city.buildings.length > 0 && (
                            <>
                                <div className="city-section-title" style={{ marginTop: 16 }}>🏗️ Buildings</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {city.buildings.map(b => (
                                        <span key={b} style={{
                                            background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                                            borderRadius: 4, padding: '3px 10px', fontSize: '.78rem'
                                        }}>{b.replace(/_/g, ' ')}</span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Build options */}
                    <div>
                        <div className="city-section-title">⚔️ Train Units</div>
                        <div className="prod-grid">
                            {(Object.keys(UNIT_DEFS) as UnitType[])
                                .filter(u => !UNIT_DEFS[u].prerequisiteTech || unlockedTechs.includes(UNIT_DEFS[u].prerequisiteTech!))
                                .map(u => (
                                    <button key={u} className="prod-btn" onClick={() => onEnqueue('UNIT', u)}>
                                        {u.replace(/_/g, ' ')}<br />
                                        <small style={{ color: 'var(--muted)' }}>{UNIT_DEFS[u].cost}⚙️ · ⚔️{UNIT_DEFS[u].combat}</small>
                                    </button>
                                ))}
                        </div>

                        <div className="city-section-title">🏗️ Build</div>
                        <div className="prod-grid">
                            {(Object.keys(BUILDING_DEFS) as BuildingType[])
                                .filter(b => !city.buildings.includes(b))
                                .filter(b => !BUILDING_DEFS[b].prerequisiteTech || unlockedTechs.includes(BUILDING_DEFS[b].prerequisiteTech!))
                                .map(b => (
                                    <button key={b} className="prod-btn" onClick={() => onEnqueue('BUILDING', b)}>
                                        {b.replace(/_/g, ' ')}<br />
                                        <small style={{ color: 'var(--muted)' }}>{BUILDING_DEFS[b].cost}⚙️</small>
                                    </button>
                                ))}
                        </div>

                        <div className="city-section-title">🏛️ Wonders</div>
                        <div className="prod-grid">
                            {(Object.keys(WONDER_DEFS) as WonderType[])
                                .filter(w => !city.wonders?.includes(w as import('../game/GameTypes').WonderType))
                                .filter(w => !WONDER_DEFS[w].prerequisiteTech || unlockedTechs.includes(WONDER_DEFS[w].prerequisiteTech!))
                                .map(w => (
                                    <button key={w} className="prod-btn" style={{ borderColor: 'var(--gold-dim)' }} onClick={() => onEnqueue('WONDER', w)}>
                                        {w.replace(/_/g, ' ')}<br />
                                        <small style={{ color: 'var(--muted)' }}>{WONDER_DEFS[w].cost}⚙️ · {WONDER_DEFS[w].effect}</small>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
