import { AlertCircle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50">
      <div className="mx-4 w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex gap-2">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
        </div>
        <p className="mt-4 text-sm text-gray-600">Did you forget to add the page to the router?</p>
      </div>
    </div>
  )
}
