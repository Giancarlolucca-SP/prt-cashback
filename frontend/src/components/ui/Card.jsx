export default function Card({ children, className = '', padding = true }) {
  return (
    <div
      className={[
        'bg-white rounded-xl shadow-sm border border-gray-200',
        padding ? 'p-6' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-1">
        {icon && <span className="text-2xl">{icon}</span>}
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-gray-500 ml-0">{subtitle}</p>}
    </div>
  );
}

export function StatCard({ label, value, icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-primary-50 text-primary-700',
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        {icon && (
          <div className={`p-2.5 rounded-lg ${colors[color]}`}>
            <span className="text-xl">{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}
