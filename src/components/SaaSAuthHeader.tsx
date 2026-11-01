import { useState, useEffect } from 'react';
import { isSupabaseConfigured, getCurrentSession, DEMO_STORES } from '../supabase/client';
import type { UserSession, Store } from '../supabase/types';

interface SaaSAuthHeaderProps {
  onStoreChange: (store: Store) => void;
}

export function SaaSAuthHeader({ onStoreChange }: SaaSAuthHeaderProps) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [stores] = useState<Store[]>(DEMO_STORES);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(DEMO_STORES[0].id);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    getCurrentSession().then((sess) => {
      setSession(sess);
      if (sess.store) {
        setSelectedStoreId(sess.store.id);
        onStoreChange(sess.store);
      }
    });
  }, []);

  function handleSelectStore(storeId: string) {
    setSelectedStoreId(storeId);
    const found = stores.find((s) => s.id === storeId);
    if (found) {
      setSession((prev) => (prev ? { ...prev, store: found } : null));
      onStoreChange(found);
    }
  }

  return (
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
          }}>SaaS ONLINE</span>
          <strong style={{ color: 'var(--app-text, #fff)', fontSize: '14px' }}>
            {session?.organization?.name || 'DRE Mais1 SaaS'}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="saas-store-select" style={{ color: 'var(--app-muted, #a9b8cb)', fontSize: '12px' }}>
            Loja selecionada:
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
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <span className="status-dot" style={{ background: isSupabaseConfigured ? '#47cbb0' : '#eab308' }} />
          <span style={{ color: 'var(--app-muted, #a9b8cb)' }}>
            {isSupabaseConfigured ? 'Supabase PostgreSQL Conectado' : 'Supabase (Modo Piloto / Local)'}
          </span>
        </div>

        <button
          onClick={() => setShowConfigModal(true)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--app-border, #304158)',
            background: 'var(--app-soft, #223146)',
            color: 'var(--app-text, #fff)',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          ⚙️ Configurar Supabase
        </button>
      </div>

      {showConfigModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#172233',
            border: '1px solid #304158',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '560px',
            width: '100%',
            color: '#fff'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Configuração de Conexão Supabase SaaS</h3>
            <p style={{ color: '#a9b8cb', fontSize: '13px', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              Para conectar o aplicativo diretamente ao seu banco de dados PostgreSQL e Supabase Auth em nuvem, defina as variáveis de ambiente em <code>.env</code> ou no seu ambiente de hospedagem:
            </p>

            <div style={{
              background: '#0d1420',
              padding: '12px 16px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#42c9b5',
              marginBottom: '16px',
              lineHeight: '1.6'
            }}>
              VITE_SUPABASE_URL=https://seu-projeto.supabase.co<br />
              VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon-key
            </div>

            <p style={{ color: '#a9b8cb', fontSize: '12px', margin: '0 0 20px 0' }}>
              O esquema SQL completo multi-tenant com Row Level Security (RLS) foi gerado em <code>/supabase/migrations/20261101000000_init_saas_schema.sql</code>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfigModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#167d73',
                  color: '#fff',
                  border: 0,
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
