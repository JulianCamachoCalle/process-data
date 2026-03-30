import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isSupabaseConfigured() && supabase) {
        const { error: supabaseAuthError } = await supabase.auth.signInAnonymously();
        if (supabaseAuthError) {
          console.error('[auth] supabase signInAnonymously failed', supabaseAuthError);
          setError(supabaseAuthError.message || 'No se pudo iniciar sesión en Supabase');
          return;
        }
      }

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });

      const data: { success?: boolean; error?: string } = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        setError(data.error || 'No se pudo iniciar sesión');
        return;
      }

      navigate('/');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-red-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-gray-900/20 blur-3xl" />

      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-red-300/70 bg-gradient-to-b from-red-500/20 to-red-400/10 shadow-[0_12px_28px_-14px_rgba(230,0,0,0.6)] mb-4">
            <ShieldCheck className="text-red-600" size={26} />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">INICIA SESIÓN</h2>
          <p className="mt-2 text-sm text-gray-500">Accedé al panel de administración</p>
        </div>

      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white/95 py-8 px-5 shadow-[0_24px_56px_-28px_rgba(15,23,42,0.45)] sm:rounded-2xl sm:px-10 border border-gray-200/90 backdrop-blur-md relative">
          <div className="absolute -top-3 right-6 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 inline-flex items-center gap-1.5">
            <Sparkles size={12} />
            Acceso privado
          </div>

          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="mt-1">
                <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 shadow-sm focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200 transition-all">
                  <LockKeyhole size={16} className="text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-1 py-3 outline-none placeholder-gray-400 sm:text-sm"
                    placeholder="Ingresá tu contraseña"
                  />
                </div>
              </div>
            </div>

            {error && <div className="text-red-600 text-sm rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</div>}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-red-500/70 rounded-xl shadow-[0_18px_30px_-18px_rgba(230,0,0,0.75)] text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
