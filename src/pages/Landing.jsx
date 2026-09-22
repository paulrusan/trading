import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-[calc(100svh-57px)] flex-col items-center justify-center gap-6 bg-bg px-4 text-center">
      <h1 className="text-3xl font-semibold text-text sm:text-4xl">
        Trading Journal
      </h1>
      <p className="max-w-md text-text-muted">
        Track trades, ideas, and notes across Gold, Silver, Nasdaq, and S&amp;P 500.
      </p>
      <Link
        to={user ? '/dashboard' : '/register'}
        className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
      >
        {user ? 'Go to dashboard' : 'Get started'}
      </Link>
    </div>
  )
}
