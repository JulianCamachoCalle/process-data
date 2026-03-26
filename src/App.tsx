import LoginPage from './components/auth/LoginPage'
import DashboardPage from './components/pages/DashboardPage'
import { AppProvider, useApp } from './context/AppContext'

function AppContent() {
  const { isSignedIn } = useApp()

  if (!isSignedIn) {
    return <LoginPage />
  }

  return <DashboardPage />
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
