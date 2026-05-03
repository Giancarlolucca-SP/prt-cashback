import { useToast } from '../../context/ToastContext.jsx';

const styles = {
  success: {
    container: 'bg-green-50 border-green-400 text-green-800',
    icon: '✓',
    iconClass: 'bg-green-400 text-white',
  },
  error: {
    container: 'bg-red-50 border-red-400 text-red-800',
    icon: '✕',
    iconClass: 'bg-red-400 text-white',
  },
  info: {
    container: 'bg-blue-50 border-blue-400 text-blue-800',
    icon: 'i',
    iconClass: 'bg-blue-400 text-white',
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    icon: '!',
    iconClass: 'bg-yellow-400 text-white',
  },
};

function Toast({ id, message, type }) {
  const { removeToast } = useToast();
  const s = styles[type] || styles.info;

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-md max-w-sm w-full animate-[slideIn_0.2s_ease] ${s.container}`}
    >
      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.iconClass}`}>
        {s.icon}
      </span>
      <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
      <button
        onClick={() => removeToast(id)}
        className="flex-shrink-0 text-current opacity-50 hover:opacity-100 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}
