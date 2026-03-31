import { useState } from 'react';
import { X, Database, RefreshCw, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface SyncResource {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
}

interface KommoSyncPanelProps {
  onClose: () => void;
}

const RESOURCES = [
  'leads',
  'contacts', 
  'companies',
  'users',
  'pipelines',
  'tasks',
  'notes',
  'events',
  'catalogs',
  'unsorted',
  'tags',
  'custom_fields',
  'links',
];

export function KommoSyncPanel({ onClose }: KommoSyncPanelProps) {
  const [resources, setResources] = useState<Record<string, SyncResource>>({});
  const [secret, setSecret] = useState('');

  const runSync = async (resource: string) => {
    if (!secret) {
      setResources(prev => ({
        ...prev,
        [resource]: { name: resource, status: 'error', message: 'Falta el secret' }
      }));
      return;
    }

    setResources(prev => ({
      ...prev,
      [resource]: { name: resource, status: 'running', message: 'Sincronizando...' }
    }));

    try {
      const res = await fetch(`/api/kommo/sync?resource=${resource}`, {
        headers: {
          'x-kommo-sync-secret': secret
        }
      });

      const data = await res.json();

      if (res.ok) {
        setResources(prev => ({
          ...prev,
          [resource]: { 
            name: resource, 
            status: 'success', 
            message: `Pulled: ${data.totalPulled}, Staged: ${data.totalStaged}` 
          }
        }));

        // Auto run process-events
        await runProcessEvents(secret);
      } else {
        setResources(prev => ({
          ...prev,
          [resource]: { name: resource, status: 'error', message: data.error || 'Error desconocido' }
        }));
      }
    } catch (err) {
      setResources(prev => ({
        ...prev,
        [resource]: { name: resource, status: 'error', message: 'Error de red' }
      }));
    }
  };

  const runProcessEvents = async (secretKey: string) => {
    try {
      await fetch('/api/kommo/process-events', {
        headers: {
          'x-kommo-process-secret': secretKey
        }
      });
    } catch (e) {
      console.error('Process events failed:', e);
    }
  };

  const runAllSync = async () => {
    for (const resource of RESOURCES) {
      await runSync(resource);
      await new Promise(r => setTimeout(r, 500));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Database className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Kommo Sync Panel</h2>
              <p className="text-xs text-gray-500">Sincronización de recursos API</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Secret Input */}
        <div className="px-6 py-4 border-b border-gray-200">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Sync Secret (env var)
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Ingresa el secret para los endpoints"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        {/* Actions */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-3">
          <button
            onClick={runAllSync}
            disabled={!secret}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            Sync All
          </button>
          <button
            onClick={() => runProcessEvents(secret)}
            disabled={!secret}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Process Events
          </button>
        </div>

        {/* Resources Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {RESOURCES.map(resource => {
              const state = resources[resource] || { name: resource, status: 'idle' };
              
              return (
                <button
                  key={resource}
                  onClick={() => runSync(resource)}
                  disabled={state.status === 'running' || !secret}
                  className={`
                    relative flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all
                    ${state.status === 'idle' ? 'border-gray-200 hover:border-orange-400 hover:bg-orange-50' : ''}
                    ${state.status === 'running' ? 'border-orange-300 bg-orange-50' : ''}
                    ${state.status === 'success' ? 'border-green-300 bg-green-50' : ''}
                    ${state.status === 'error' ? 'border-red-300 bg-red-50' : ''}
                    disabled:cursor-not-allowed
                  `}
                >
                  {state.status === 'running' && (
                    <Loader2 className="w-4 h-4 text-orange-600 animate-spin absolute top-2 right-2" />
                  )}
                  {state.status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                  )}
                  {state.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-600 absolute top-2 right-2" />
                  )}
                  
                  <span className="font-medium text-sm text-gray-700">{resource}</span>
                  
                  {state.message && (
                    <span className="text-xs text-gray-500 block truncate w-full">
                      {state.message}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          Panel de administración • Endpoints: /api/kommo/sync
        </div>
      </div>
    </div>
  );
}