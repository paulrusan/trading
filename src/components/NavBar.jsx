import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function NavBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
      <Link to="/" className="font-semibold text-text">
        Trading Journal
      </Link>

      {user ? (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <Link to="/dashboard" className="text-text-muted hover:text-text">
            Dashboard
          </Link>
          <Link to="/trades" className="text-text-muted hover:text-text">
            Trades
          </Link>
          <Link to="/ideas" className="text-text-muted hover:text-text">
            Ideas
          </Link>
          <Link to="/notes" className="text-text-muted hover:text-text">
            Notes
          </Link>
          <Link to="/chart" className="text-text-muted hover:text-text">
            Chart
          </Link>
          <Link to="/watchlist" className="text-text-muted hover:text-text">
            Watchlist
          </Link>
          <Link to="/alerts" className="text-text-muted hover:text-text">
            Alerts
          </Link>
          <Link to="/assistant" className="text-text-muted hover:text-text">
            Assistant
          </Link>
          <Link to="/settings" className="text-text-muted hover:text-text">
            Settings
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
          >
            Log out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-sm">
          <Link to="/login" className="text-text-muted hover:text-text">
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-accent px-3 py-1.5 text-white hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      )}
    </nav>
  )
}
