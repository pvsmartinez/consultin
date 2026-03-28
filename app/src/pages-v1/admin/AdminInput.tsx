import type { InputHTMLAttributes } from 'react'

/** Shared dark-theme input for the Admin panel. */
const AdminInput = ({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <div>
    <label className="block text-xs text-gray-400 mb-1">{label}</label>
    <input
      {...props}
      className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600 disabled:opacity-40 ${
        error ? 'border-red-500' : 'border-gray-700'
      } ${props.readOnly ? 'opacity-60' : ''}`}
    />
    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
  </div>
)

export default AdminInput
