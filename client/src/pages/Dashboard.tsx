import { useEffect, useState } from 'react'
import { analytics } from '../lib/api'
import { StatCard } from '../components/Card'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import {
  MessageSquare,
  Users,
  CalendarCheck,
  TrendingUp,
} from 'lucide-react'

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [funnel, setFunnel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([analytics.overview(), analytics.funnel()])
      .then(([o, f]) => {
        setOverview(o)
        setFunnel(f)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  const o = overview || {}

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Conversas"
          value={o.totalConversations ?? 0}
          icon={<MessageSquare className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="Contatos"
          value={o.totalContacts ?? 0}
          icon={<Users className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="Agendamentos"
          value={o.totalBookings ?? 0}
          icon={<CalendarCheck className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          label="Taxa de Conversao"
          value={o.conversionRate ? `${(o.conversionRate * 100).toFixed(1)}%` : '0%'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="yellow"
        />
      </div>

      {/* Funnel */}
      {funnel && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Funil de Leads</h2>
          <div className="space-y-3">
            {[
              { label: 'Novos Contatos', value: funnel.newContacts ?? 0, color: 'bg-blue-500' },
              { label: 'Em Qualificacao', value: funnel.qualifying ?? 0, color: 'bg-yellow-500' },
              { label: 'Qualificados', value: funnel.qualified ?? 0, color: 'bg-green-500' },
              { label: 'Agendados', value: funnel.booked ?? 0, color: 'bg-purple-500' },
            ].map((step) => {
              const max = Math.max(funnel.newContacts || 1, 1)
              const pct = Math.round((step.value / max) * 100)
              return (
                <div key={step.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{step.label}</span>
                    <span className="font-medium text-gray-900">{step.value}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${step.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Recent stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Mensagens (30 dias)</h2>
          <p className="text-3xl font-bold text-blue-600">{o.messagesLast30Days ?? 0}</p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Custo IA (mes)</h2>
          <p className="text-3xl font-bold text-green-600">
            R$ {(o.monthlyAiCost ?? 0).toFixed(2)}
          </p>
          {o.aiCostLimit > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Limite: R$ {o.aiCostLimit.toFixed(2)}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
