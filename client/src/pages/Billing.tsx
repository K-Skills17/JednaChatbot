import { useEffect, useState } from 'react'
import { billing as billingApi } from '../lib/api'
import Card, { StatCard } from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { CreditCard, Receipt } from 'lucide-react'

export default function Billing() {
  const [overview, setOverview] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([billingApi.overview(), billingApi.invoices()])
      .then(([o, inv]) => {
        setOverview(o)
        setInvoices(Array.isArray(inv) ? inv : inv.invoices || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCheckout = async (plan: string) => {
    const { url } = await billingApi.checkout(plan)
    window.location.href = url
  }

  const handlePortal = async () => {
    const { url } = await billingApi.portal()
    window.location.href = url
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  const sub = overview?.subscription
  const plan = overview?.plan || 'free'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Cobranca</h1>

      {/* Plan overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Plano Atual"
          value={plan.charAt(0).toUpperCase() + plan.slice(1)}
          sub={sub ? `Renova em ${new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}` : undefined}
          icon={<CreditCard className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          label="Faturas"
          value={invoices.length}
          icon={<Receipt className="w-5 h-5" />}
          color="blue"
        />
      </div>

      {/* Actions */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Gerenciar Assinatura</h2>
        <div className="flex flex-wrap gap-3">
          {!sub && (
            <>
              <button
                onClick={() => handleCheckout('starter')}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Assinar Starter
              </button>
              <button
                onClick={() => handleCheckout('pro')}
                className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Assinar Pro
              </button>
            </>
          )}
          {sub && (
            <button
              onClick={handlePortal}
              className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900"
            >
              Portal de Pagamento Stripe
            </button>
          )}
        </div>
      </Card>

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card className="overflow-x-auto !p-0">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Faturas</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Data</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Valor</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100">
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(inv.createdAt || inv.periodStart).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    R$ {((inv.amountCents || inv.amount || 0) / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={inv.status === 'paid' ? 'green' : inv.status === 'open' ? 'yellow' : 'gray'}>
                      {inv.status === 'paid' ? 'Paga' : inv.status === 'open' ? 'Aberta' : inv.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
