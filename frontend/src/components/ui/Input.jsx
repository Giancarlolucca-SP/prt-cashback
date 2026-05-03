export default function Input({
  label,
  error,
  hint,
  id,
  className = '',
  prefix,
  suffix,
  ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-500 font-medium text-sm select-none">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          className={[
            'w-full rounded-lg border bg-white text-gray-900 text-sm',
            'px-3 py-2.5 transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            'placeholder:text-gray-400',
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            error ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
            prefix ? 'pl-8' : '',
            suffix ? 'pr-10' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-gray-500 font-medium text-sm select-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
