import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, getCurrentSession, testSupabaseConnection } from '../supabase/client';
import type { UserSession, Store } from '../supabase/types';
import { SaaSAuthModal } from './SaaSAuthModal';

interface SaaSAuthHeaderProps {
  onStoreChange: (store: Store | null) => void;
}

export function SaaSAuthHeader({ onStoreChange }: SaaSAuthHeaderProps) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [userStores, setUserStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string } | null>(null);

  async function loadUserSession() {
    const sess = await getCurrentSession();
    setSession(sess);

    if (sess.user && supabase) {
      const { data: memberships } = await supabase
        .from('store_memberships')
        .select('store_id, store:stores(*)')
        .eq('user_id', sess.user.id);

      const storesList: Store[] = (memberships || [])
        .map((m) => (Array.isArray(m.store) ? m.store[0] : m.store) as unknown as Store | null)
        .filter((s): s is Store => Boolean(s && typeof s === 'object' && 'id' in s));

      setUserStores(storesList);
      if (storesList.length > 0) {
        setSelectedStoreId(storesList[0].id);
        onStoreChange(storesList[0]);
      } else {
        onStoreChange(sess.store);
      }
    } else {
      setUserStores([]);
      onStoreChange(null);
    }
  }

  useEffect(() => {
    loadUserSession();
    testSupabaseConnection().then(setConnectionStatus);

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        loadUserSession();
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  function handleSelectStore(storeId: string) {
    setSelectedStoreId(storeId);
    const found = userStores.find((s) => s.id === storeId);
    if (found) {
      onStoreChange(found);
    }
  }

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUserStores([]);
    onStoreChange(null);
  }

  return (
    <>
      <div className="saas-header-bar" style={{
        background: 'var(--app-surface, #172233)',
        borderBottom: '1px solid var(--app-border, #304158)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: '#167d73',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 800,
              padding: '3px 7px',
              borderRadius: '4px',
              letterSpacing: '0.5px'
            }}>
              SaaS ONLINE
            </span>
            <strong style={{ color: 'var(--app-text, #fff)', fontSize: '14px' }}>
              {session?.organization?.name || 'DRE Mais1 SaaS'}
            </strong>
          </div>

          {session?.user && userStores.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="saas-store-select" style={{ color: 'var(--app-muted, #a9b8cb)', fontSize: '12px' }}>
                Loja:
              </label>
              <select
                id="saas-store-select"
                value={selectedStoreId}
                onChange={(e) => handleSelectStore(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--app-field-border, #45566e)',
                  background: 'var(--app-field, #202e42)',
                  color: 'var(--app-text, #fff)',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                {userStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span className="status-dot" style={{
              background: connectionStatus?.connected && session?.user ? '#47cbb0' : isSupabaseConfigured ? '#eab308' : '#ef4444'
            }} />
            <span style={{ color: 'var(--app-muted, #a9b8cb)' }}>
              {session?.user
                ? `Conectado (${session.user.email})`
                : connectionStatus?.connected
                ? 'Supabase Conectado (Aguardando Login)'
                : 'Supabase Não Configurado'}
            </span>
          </div>

          {session?.user ? (
            <button
              onClick={handleSignOut}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #75404b',
                background: '#3d222a',
                color: '#ffd1d6',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Sair
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 0,
                background: '#167d73',
                color: '#fff',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Entrar / Cadastrar
            </button>
          )}
        </div>
      </div>

      {showAuthModal && (
        <SaaSAuthModal
          onSuccess={() => {
            setShowAuthModal(false);
            loadUserSession();
          }}
          onCancel={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
