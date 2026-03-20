import { useMemo, useState } from 'react';
import App from './App';
import { useMultiplayer } from './multiplayer/useMultiplayer';
import { CIV_DEFS, CIV_KEYS, type CivKey } from './game/Civilizations';

export default function Root() {
  const mp = useMultiplayer();
  const [joinCode, setJoinCode] = useState('');
  const canStart = mp.isHost && (mp.players?.length ?? 0) >= 2;
  const revealMode = mp.hostSettings?.revealMode ?? 'FOG';
  const startDisabledReason = !mp.isHost
    ? 'Seul l’hôte peut démarrer.'
    : (mp.players?.length ?? 0) < 2
      ? 'Il faut au moins 2 joueurs connectés.'
      : '';

  const lobbyPlayers = useMemo(() => {
    return [...mp.players].sort((a, b) => a.playerIndex - b.playerIndex);
  }, [mp.players]);

  if (mp.phase === 'inGame' && mp.gameState && mp.myPlayerIndex !== null) {
    return (
      <App
        multiplayer={{
          state: mp.gameState,
          myPlayerIndex: mp.myPlayerIndex,
          sendAction: mp.sendAction,
          disconnect: mp.disconnect,
          lastError: mp.lastError,
          revealMode,
        }}
      />
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'radial-gradient(ellipse at center, #0e1620 0%, #060c14 100%)',
      color: 'var(--text)',
      fontFamily: 'var(--font-body)'
    }}>
      <div style={{
        width: 760,
        maxWidth: '95vw',
        background: 'rgba(12,20,32,0.92)',
        border: '1px solid rgba(212,175,55,0.4)',
        borderRadius: 16,
        padding: 22,
        boxShadow: '0 24px 60px rgba(0,0,0,.75)'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-head)', color: 'var(--gold)', fontSize: 22, letterSpacing: 1 }}>
            Civilization Online (Host sur ton PC)
          </div>
          {mp.connected ? (
            <button className="action-btn" onClick={mp.disconnect}>Disconnect</button>
          ) : null}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="panel-section" style={{ margin: 0 }}>
            <div className="panel-label">Connexion</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Ton nom</label>
              <input
                value={mp.name}
                onChange={(e) => mp.setName(e.target.value)}
                placeholder="Player"
                style={inputStyle}
              />
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Adresse du serveur (PC hôte)</label>
              <input
                value={mp.serverUrl}
                onChange={(e) => mp.setServerUrl(e.target.value)}
                placeholder="http://localhost:3001"
                style={inputStyle}
              />
              <button className="action-btn green" onClick={mp.connect} disabled={mp.connected}>
                Connect
              </button>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                En Option A, l’hôte donne son IP publique + ouvre le port <b>3001</b> (port forwarding).
              </div>
              {mp.lastError && (
                <div style={{ color: '#ffb4b4', fontSize: 12, background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)', padding: 10, borderRadius: 10 }}>
                  {mp.lastError}
                </div>
              )}
            </div>
          </div>

          <div className="panel-section" style={{ margin: 0 }}>
            <div className="panel-label">Partie</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="action-btn" onClick={mp.createRoom} disabled={!mp.connected}>
                Host (Créer une room)
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="CODE (ex: AB12CD)"
                  style={inputStyle}
                />
                <button className="action-btn" onClick={() => mp.joinRoom(joinCode)} disabled={!mp.connected}>
                  Join
                </button>
              </div>

              {mp.code && (
                <div style={{ marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room code</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 28, color: 'var(--gold)', letterSpacing: 3 }}>
                    {mp.code}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>Joueurs</div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {lobbyPlayers.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                        <div>
                          <b style={{ color: p.connected ? 'var(--text)' : 'rgba(226,232,240,0.6)' }}>{p.name}</b>
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                            P{p.playerIndex + 1}{p.isHost ? ' (host)' : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: p.connected ? '#8ae26e' : '#ffb4b4' }}>
                          {p.connected ? 'connected' : 'disconnected'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Your civ choice */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(212,175,55,0.2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 8 }}>
                      Choix de civilisation (toi)
                    </div>
                    <select
                      value={(mp.you?.civChoice ?? 'RANDOM') as any}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v || v === 'RANDOM') mp.setCivChoice(null);
                        else mp.setCivChoice(v as CivKey);
                      }}
                      style={inputStyle}
                    >
                      <option value="RANDOM">Random</option>
                      {CIV_DEFS.map(c => (
                        <option key={c.key} value={c.key}>
                          {c.playerName} ({c.civilizationName})
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      Tu peux aussi laisser Random.
                    </div>
                  </div>

                  {/* Host settings */}
                  {mp.isHost && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 8 }}>Réglages host (tests)</div>

                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Mode carte</div>
                          <select
                            value={revealMode}
                            onChange={(e) => {
                              mp.updateHostSettings({
                                revealMode: e.target.value as any,
                                aiCount: mp.hostSettings?.aiCount ?? 0,
                                aiCivChoices: mp.hostSettings?.aiCivChoices ?? [],
                              });
                            }}
                            style={inputStyle}
                          >
                            <option value="FOG">FOG (vision par joueur)</option>
                            <option value="ALL">ALL_MAP_DEBUG (tout le monde voit tout)</option>
                          </select>
                        </div>

                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nombre d'IA</div>
                          <input
                            type="number"
                            min={0}
                            max={3}
                            value={mp.hostSettings?.aiCount ?? 0}
                            onChange={(e) => {
                              const aiCount = Math.max(0, Math.min(3, Number(e.target.value || 0)));
                              const prevChoices = mp.hostSettings?.aiCivChoices ?? [];
                              const nextChoices = prevChoices.slice(0, aiCount);
                              while (nextChoices.length < aiCount) nextChoices.push(null);
                              mp.updateHostSettings({
                                revealMode: revealMode as any,
                                aiCount,
                                aiCivChoices: nextChoices,
                              });
                            }}
                            style={inputStyle}
                          />
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Max 3 pour éviter que ça rame.</div>
                        </div>

                        {mp.hostSettings?.aiCount ? (
                          <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Civ IA (host)</div>
                            {Array.from({ length: mp.hostSettings.aiCount }).map((_, idx) => (
                              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>IA {idx + 1}</div>
                                <select
                                  value={(mp.hostSettings?.aiCivChoices?.[idx] ?? 'RANDOM') as any}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const nextChoices = [...(mp.hostSettings?.aiCivChoices ?? [])];
                                    nextChoices[idx] = (!v || v === 'RANDOM') ? null : (v as CivKey);
                                    mp.updateHostSettings({
                                      revealMode: revealMode as any,
                                      aiCount: mp.hostSettings?.aiCount ?? 0,
                                      aiCivChoices: nextChoices,
                                    });
                                  }}
                                  style={inputStyle}
                                >
                                  <option value="RANDOM">Random</option>
                                  {CIV_DEFS.map(c => (
                                    <option key={c.key} value={c.key}>
                                      {c.playerName} ({c.civilizationName})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="action-btn green" onClick={mp.startGame} disabled={!canStart} title={startDisabledReason || undefined}>
                      Start game
                    </button>
                    <button className="action-btn" onClick={mp.disconnect}>
                      Leave
                    </button>
                  </div>
                  {!canStart && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      {startDisabledReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Astuce test: ouvre 2 onglets sur ton PC, connecte les deux sur `http://localhost:3001`, Host puis Join avec le code.
          </div>
          <div>
            <button className="action-btn" onClick={() => window.location.reload()}>
              Reset UI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--text)',
  outline: 'none',
};

