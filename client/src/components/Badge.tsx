interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'purple'
}

const COLORS = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  gray: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
}

export default function Badge({ children, variant = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${COLORS[variant]}`}
    >
      {children}
    </span>
  )
}
