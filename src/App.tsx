import LoginPage from './components/auth/LoginPage'
import SessionLoader from './components/common/SessionLoader'
import DashboardRouter from './components/pages/DashboardRouter'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/useApp'

function AppContent() {
  const { isSignedIn, isLoading } = useApp()

  if (isLoading) {
    return <SessionLoader />
  }

  if (!isSignedIn) {
    return <LoginPage />
  }

  return <DashboardRouter />
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
