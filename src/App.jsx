import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { PrivateRoute } from './components/PrivateRoute'
import { AuthProvider } from './context/AuthContext'
import AlertChart from './pages/AlertChart'
import Alerts from './pages/Alerts'
import Assistant from './pages/Assistant'
import ChartAnalysis from './pages/ChartAnalysis'
import Dashboard from './pages/Dashboard'
import Ideas from './pages/Ideas'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Notes from './pages/Notes'
import Register from './pages/Register'
import Settings from './pages/Settings'
import SnapshotDetail from './pages/SnapshotDetail'
import Trades from './pages/Trades'
import Watchlist from './pages/Watchlist'

function App() {
  return (
    <BrowserRouter basename="/trading">
      <AuthProvider>
        <NavBar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/trades"
            element={
              <PrivateRoute>
                <Trades />
              </PrivateRoute>
            }
          />
          <Route
            path="/ideas"
            element={
              <PrivateRoute>
                <Ideas />
              </PrivateRoute>
            }
          />
          <Route
            path="/notes"
            element={
              <PrivateRoute>
                <Notes />
              </PrivateRoute>
            }
          />
          <Route
            path="/chart"
            element={
              <PrivateRoute>
                <ChartAnalysis />
              </PrivateRoute>
            }
          />
          <Route
            path="/assistant"
            element={
              <PrivateRoute>
                <Assistant />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <Settings />
              </PrivateRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <PrivateRoute>
                <Alerts />
              </PrivateRoute>
            }
          />
          <Route
            path="/alert-chart"
            element={
              <PrivateRoute>
                <AlertChart />
              </PrivateRoute>
            }
          />
          <Route
            path="/watchlist"
            element={
              <PrivateRoute>
                <Watchlist />
              </PrivateRoute>
            }
          />
          <Route
            path="/snapshot"
            element={
              <PrivateRoute>
                <SnapshotDetail />
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
