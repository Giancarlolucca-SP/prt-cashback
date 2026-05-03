import Button from './Button.jsx';

export default function Modal({ open, title, children, onConfirm, onCancel, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', loading = false, confirmVariant = 'primary' }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-[fadeIn_0.15s_ease]">
        {title && (
          <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
        )}
        <div className="text-sm text-gray-700 mb-6">{children}</div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
