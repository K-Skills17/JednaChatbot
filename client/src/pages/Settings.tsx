import { useEffect, useState } from 'react'
import { tenant as tenantApi, auth as authApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'

export default function Settings() {
  const { user } = useAuth()
  const [tenantData, setTenantData] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  // New user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newUserPw, setNewUserPw] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [addError, setAddError] = useState('')

  const fetchData = () => {
    const promises: Promise<any>[] = [tenantApi.get()]
    if (user?.role === 'owner') promises.push(authApi.listUsers())

    Promise.all(promises)
      .then(([t, u]) => {
        setTenantData(t)
        if (u) setUsers(u.users || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg('')
    setPwError('')
    try {
      await authApi.changePassword(currentPw, newPw)
      setPwMsg('Senha alterada com sucesso!')
      setCurrentPw('')
      setNewPw('')
    } catch (err: any) {
      setPwError(err.message || 'Erro ao alterar senha')
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    try {
      await authApi.register({
        tenantId: user!.tenantId,
        email: newEmail,
        password: newUserPw,
        name: newName,
        role: newRole,
      })
      setShowAddUser(false)
      setNewEmail('')
      setNewName('')
      setNewUserPw('')
      fetchData()
    } catch (err: any) {
      setAddError(err.message || 'Erro ao adicionar usuario')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Remover este usuario?')) return
    await authApi.deleteUser(userId)
    fetchData()
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
      <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>

      {/* Tenant info */}
      {tenantData && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Informacoes da Clinica</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Nome</p>
              <p className="font-medium text-gray-900">{tenantData.businessName}</p>
            </div>
            <div>
              <p className="text-gray-500">WhatsApp</p>
              <p className="font-medium text-gray-900">{tenantData.whatsappNumber}</p>
            </div>
            <div>
              <p className="text-gray-500">Plano</p>
              <Badge variant="blue">{tenantData.plan}</Badge>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <Badge variant={tenantData.status === 'active' ? 'green' : 'yellow'}>
                {tenantData.status}
              </Badge>
            </div>
            <div>
              <p className="text-gray-500">Fuso Horario</p>
              <p className="font-medium text-gray-900">{tenantData.timezone}</p>
            </div>
            <div>
              <p className="text-gray-500">Criado em</p>
              <p className="font-medium text-gray-900">
                {new Date(tenantData.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Change password */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alterar Senha</h2>
        <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
          {pwMsg && (
            <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{pwMsg}</p>
          )}
          {pwError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwError}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
            <input
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Alterar Senha
          </button>
        </form>
      </Card>

      {/* Team management (owner only) */}
      {user?.role === 'owner' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Equipe</h2>
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {showAddUser ? 'Cancelar' : 'Adicionar'}
            </button>
          </div>

          {showAddUser && (
            <form onSubmit={handleAddUser} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
              {addError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>
              )}
              <input
                type="text"
                required
                placeholder="Nome"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Senha (min. 8 caracteres)"
                value={newUserPw}
                onChange={(e) => setNewUserPw(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                <option value="staff">Equipe</option>
                <option value="owner">Proprietario</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Criar Usuario
              </button>
            </form>
          )}

          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-3 px-1 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {u.name} {u.id === user?.id && <span className="text-gray-400">(voce)</span>}
                  </p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={u.role === 'owner' ? 'purple' : 'gray'}>
                    {u.role === 'owner' ? 'Proprietario' : 'Equipe'}
                  </Badge>
                  {u.id !== user?.id && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
