import React from 'react';
import type { TechType, Player } from '../game/GameTypes';
import { TECH_DEFS } from '../game/DataDefs';
import { CheckCircle, FlaskConical } from 'lucide-react';

interface TechTreeProps {
    player: Player;
    onSelectResearch: (tech: TechType) => void;
    onClose: () => void;
}

export const TechTree: React.FC<TechTreeProps> = ({ player, onSelectResearch, onClose }) => {
    const byEra: Record<string, TechType[]> = {};
    for (const [t, def] of Object.entries(TECH_DEFS)) {
        if (!byEra[def.era]) byEra[def.era] = [];
        byEra[def.era].push(t as TechType);
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content tech-tree">
                <button className="close-btn" onClick={onClose}>&times;</button>
                <h2><FlaskConical size={22} /> Technology Tree</h2>

                {Object.entries(byEra).map(([era, techs]) => (
                    <div key={era}>
                        <div className="era-header">{era} Era</div>
                        <div className="tech-grid">
                            {techs.map(tech => {
                                const def = TECH_DEFS[tech];
                                const isUnlocked = player.science.unlocked.includes(tech);
                                const isResearching = player.science.researching === tech;
                                const canResearch = def.prereqs.every(p => player.science.unlocked.includes(p)) && !isUnlocked;

                                let cls = 'locked';
                                if (isUnlocked) cls = 'unlocked';
                                else if (isResearching) cls = 'researching';
                                else if (canResearch) cls = 'available';

                                return (
                                    <div
                                        key={tech}
                                        className={`tech-node ${cls}`}
                                        onClick={() => canResearch && onSelectResearch(tech)}
                                        title={canResearch ? 'Click to research' : undefined}
                                    >
                                        {isUnlocked && <CheckCircle size={14} className="status-icon" />}
                                        <h3>{tech.replace(/_/g, ' ')}</h3>
                                        <div className="tech-cost">
                                            ⚗️ {def.cost} science
                                            {canResearch && (
                                                <span style={{ marginLeft: 8, color: '#3498db' }}>
                                                    ({Math.ceil(def.cost / Math.max(1, player.globalYields.science))} turns)
                                                </span>
                                            )}
                                        </div>
                                        {def.prereqs.length > 0 && (
                                            <div className="tech-cost">Requires: {def.prereqs.map(p => p.replace(/_/g, ' ')).join(', ')}</div>
                                        )}
                                        {isResearching && (
                                            <div className="progress-bar">
                                                <div className="progress-fill" style={{ width: `${Math.min(100, (player.science.progress / def.cost) * 100)}%` }} />
                                            </div>
                                        )}
                                        <div className="unlocks">🔓 {def.unlocks.join(', ')}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
