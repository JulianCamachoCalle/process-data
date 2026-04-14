import { useEffect, useMemo, useState } from 'react';
import { Shield, UserPlus, Users } from 'lucide-react';

type AppRole = 'admin' | 'user';

interface AdminUser {
  id: string;
  email: string;
  role: AppRole;
  is_active: boolean;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('user');

  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid = emailRegex.test(normalizedEmail);
  const isPasswordValid = password.length >= 8;

  const roleLabel = useMemo(() => {
    return role === 'admin' ? 'Administrador' : 'Usuario';
  }, [role]);

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        setError(String(payload?.error ?? 'No se pudo cargar usuarios'));
        return;
      }

      const nextUsers = Array.isArray(payload.users) ? payload.users as AdminUser[] : [];
      setUsers(nextUsers);
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isEmailValid) {
      setError('Ingresá un email válido');
      return;
    }

    if (!isPasswordValid) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          role,
          is_active: true,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        setError(String(payload?.error ?? 'No se pudo crear el usuario'));
        return;
      }

      setEmail('');
      setPassword('');
      setRole('user');
      await loadUsers();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Administración</p>
        <h1 className="mt-2 inline-flex items-center gap-2 text-2xl font-extrabold uppercase tracking-[0.08em] text-gray-900">
          <Shield className="text-red-600" size={22} />
          Usuarios y Roles
        </h1>
        <p className="mt-2 text-sm text-gray-600">Creá usuarios internos y asignales uno de los dos roles disponibles: admin o user.</p>
      </header>

      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={handleCreateUser}>
          <label className="space-y-2 text-sm font-semibold text-gray-700 md:col-span-2">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
              type="email"
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'user')}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="admin">admin</option>
              <option value="user">user</option>
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-gray-700 md:col-span-2">
            Contraseña
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm"
              required
              type="password"
            />
          </label>

          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={isSubmitting || !isEmailValid || !isPasswordValid}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              <UserPlus size={14} />
              {isSubmitting ? 'Creando...' : `Crear ${roleLabel}`}
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-gray-700">
          <Users size={16} className="text-red-600" />
          Usuarios registrados
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Cargando usuarios...</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.12em] text-gray-500">
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="text-gray-700">
                    <td className="px-3 py-2 font-medium">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">{user.is_active ? 'Activo' : 'Inactivo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length ? <p className="mt-3 text-sm text-gray-500">No hay usuarios cargados.</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
