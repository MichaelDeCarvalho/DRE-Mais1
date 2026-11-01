import { useState } from 'react';
import { supabase, isSupabaseConfigured, testSupabaseConnection } from '../supabase/client';

interface SaaSAuthModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function SaaSAuthModal({ onSuccess, onCancel }: SaaSAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setError('O Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setMessage('Cadastro realizado com sucesso! Verifique seu e-mail para confirmar a conta ou faça login.');
        setIsSignUp(false);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePing() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await testSupabaseConnection();
    if (res.connected) {
      setMessage(`✓ ${res.message}`);
    } else {
      setError(`⚠ ${res.message}`);
    }
    setLoading(false);
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(5px)',
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
        padding: '28px',
        maxWidth: '440px',
        width: '100%',
        color: '#fff',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            background: '#167d73',
            color: '#fff',
            fontWeight: 800,
            borderRadius: '8px',
            width: '36px',
            height: '36px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '18px'
          }}>D</div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>DRE Mais1 SaaS</h3>
            <small style={{ color: '#a9b8cb', fontSize: '11px' }}>Autenticação Supabase PostgreSQL</small>
          </div>
        </div>

        <p style={{ color: '#a9b8cb', fontSize: '12px', lineHeight: '1.5', margin: '0 0 20px 0' }}>
          {isSignUp
            ? 'Crie sua conta para acessar suas lojas e gerenciar relatórios financeiros com segurança multi-tenant.'
            : 'Entre com seu e-mail e senha cadastrados no Supabase para acessar os módulos da sua loja.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#a9b8cb', marginBottom: '6px' }}>E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com.br"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #45566e',
                background: '#202e42',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#a9b8cb', marginBottom: '6px' }}>Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #45566e',
                background: '#202e42',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#3d222a',
              border: '1px solid #75404b',
              color: '#ffd1d6',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px'
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: '#1a3d36',
              border: '1px solid #287a6c',
              color: '#8febd4',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px'
            }}>
              {message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                background: '#167d73',
                color: '#fff',
                border: 0,
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {loading ? 'Aguarde…' : isSignUp ? 'Criar Conta' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                color: '#a9b8cb',
                border: '1px solid #304158',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #304158' }}>
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
            style={{ background: 'none', border: 0, color: '#42c9b5', fontSize: '12px', cursor: 'pointer', padding: 0 }}
          >
            {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
          </button>

          <button
            type="button"
            onClick={handlePing}
            style={{ background: 'none', border: 0, color: '#a9b8cb', fontSize: '11px', cursor: 'pointer', padding: 0 }}
          >
            🔍 Testar Conexão Supabase
          </button>
        </div>
      </div>
    </div>
  );
}
