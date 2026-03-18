import { useEffect, useState } from 'react'
import { bookings as bookingsApi } from '../lib/api'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'

const STATUS_MAP: Record<string, { label: string; variant: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }> = {
  scheduled: { label: 'Agendado', variant: 'blue' },
  confirmed: { label: 'Confirmado', variant: 'green' },
  completed: { label: 'Concluido', variant: 'green' },
  cancelled: { label: 'Cancelado', variant: 'red' },
  no_show: { label: 'Nao compareceu', variant: 'yellow' },
}

export default function Bookings() {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBookings = () => {
    bookingsApi.list()
      .then((data) => setBookings(Array.isArray(data) ? data : data.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchBookings() }, [])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar este agendamento?')) return
    await bookingsApi.cancel(id)
    fetchBookings()
  }

  const handleComplete = async (id: string) => {
    await bookingsApi.complete(id)
    fetchBookings()
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
      <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>

      {bookings.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Nenhum agendamento encontrado.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Paciente</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Data/Hora</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Servico</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const s = STATUS_MAP[b.status] || { label: b.status, variant: 'gray' as const }
                return (
                  <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{b.contactName || b.contact?.name || '-'}</p>
                      <p className="text-gray-500 text-xs">{b.contactPhone || b.contact?.phone || ''}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {b.dateTime
                        ? new Date(b.dateTime).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{b.service || '-'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {b.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => handleComplete(b.id)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            Concluir
                          </button>
                          <button
                            onClick={() => handleCancel(b.id)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
