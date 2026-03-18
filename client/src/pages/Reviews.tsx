import { useEffect, useState } from 'react'
import { reviews as reviewsApi } from '../lib/api'
import Card, { StatCard } from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { Star, TrendingUp, ThumbsUp, ThumbsDown } from 'lucide-react'

export default function Reviews() {
  const [reviews, setReviews] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([reviewsApi.list(), reviewsApi.stats()])
      .then(([r, s]) => {
        setReviews(r.reviews || [])
        setStats(s)
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Avaliacoes</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Media"
            value={stats.averageRating?.toFixed(1) ?? '-'}
            icon={<Star className="w-5 h-5" />}
            color="yellow"
          />
          <StatCard
            label="NPS Score"
            value={stats.npsScore ?? 0}
            icon={<TrendingUp className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            label="Promotores"
            value={stats.promoters ?? 0}
            icon={<ThumbsUp className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            label="Detratores"
            value={stats.detractors ?? 0}
            icon={<ThumbsDown className="w-5 h-5" />}
            color="red"
          />
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">Nenhuma avaliacao encontrada.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{r.contact?.name || 'Paciente'}</span>
                    <Badge
                      variant={
                        r.status === 'completed' ? 'green' :
                        r.status === 'pending' ? 'yellow' :
                        r.status === 'expired' ? 'gray' : 'gray'
                      }
                    >
                      {r.status === 'completed' ? 'Respondida' :
                       r.status === 'pending' ? 'Pendente' :
                       r.status === 'expired' ? 'Expirada' : r.status}
                    </Badge>
                  </div>
                  {r.feedback && (
                    <p className="text-sm text-gray-600 mt-2">{r.feedback}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {r.rating != null && (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-5 h-5 ${s <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
