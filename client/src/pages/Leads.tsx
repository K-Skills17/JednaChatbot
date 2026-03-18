import { useEffect, useState } from 'react'
import { contacts as contactsApi } from '../lib/api'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'

const STATUS_MAP: Record<string, { label: string; variant: 'green' | 'yellow' | 'blue' | 'gray' | 'purple' }> = {
  new: { label: 'Novo', variant: 'blue' },
  qualifying: { label: 'Qualificando', variant: 'yellow' },
  qualified: { label: 'Qualificado', variant: 'green' },
  booked: { label: 'Agendado', variant: 'purple' },
  lost: { label: 'Perdido', variant: 'gray' },
}

export default function Leads() {
  const [contacts, setContacts] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    contactsApi
      .list(page, 25)
      .then((data) => {
        setContacts(data.contacts || [])
        setTotal(data.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  const totalPages = Math.ceil(total / 25)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <span className="text-sm text-gray-500">{total} contatos</span>
      </div>

      {contacts.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Nenhum lead encontrado.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Nome</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Telefone</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Estagio</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Origem</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const s = STATUS_MAP[c.leadStatus] || { label: c.leadStatus || 'Novo', variant: 'gray' as const }
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.name || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">{c.phone}</td>
                    <td className="px-6 py-4">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {c.tags?.length ? c.tags.join(', ') : 'whatsapp'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Pagina {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Proxima
          </button>
        </div>
      )}
    </div>
  )
}
