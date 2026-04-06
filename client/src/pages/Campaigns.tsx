import { useEffect, useState } from 'react'
import { campaigns as campaignsApi } from '../lib/api'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'

const STATUS_BADGE: Record<string, { label: string; variant: 'green' | 'yellow' | 'blue' | 'gray' | 'red' }> = {
  draft: { label: 'Rascunho', variant: 'gray' },
  running: { label: 'Ativa', variant: 'green' },
  paused: { label: 'Pausada', variant: 'yellow' },
  completed: { label: 'Concluida', variant: 'blue' },
  failed: { label: 'Falhou', variant: 'red' },
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCampaigns = () => {
    campaignsApi
      .list()
      .then((data) => setCampaigns(Array.isArray(data) ? data : data.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCampaigns() }, [])

  const handleStart = async (id: string) => {
    await campaignsApi.start(id)
    fetchCampaigns()
  }

  const handlePause = async (id: string) => {
    await campaignsApi.pause(id)
    fetchCampaigns()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>

      {campaigns.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Nenhuma campanha encontrada.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const s = STATUS_BADGE[c.status] || { label: c.status, variant: 'gray' as const }
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{c.name}</h3>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                    {c.description && (
                      <p className="text-sm text-gray-500 mt-1">{c.description}</p>
                    )}
                    <div className="flex gap-4 mt-3 text-xs text-gray-400">
                      <span>Contatos: {c.contactCount ?? c._count?.contacts ?? 0}</span>
                      <span>Enviadas: {c.sentCount ?? 0}</span>
                      <span>
                        Criada em: {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {c.status === 'draft' && (
                      <button
                        onClick={() => handleStart(c.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Iniciar
                      </button>
                    )}
                    {c.status === 'running' && (
                      <button
                        onClick={() => handlePause(c.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                      >
                        Pausar
                      </button>
                    )}
                    {c.status === 'paused' && (
                      <button
                        onClick={() => handleStart(c.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Retomar
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
