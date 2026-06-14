import React, { useState, useEffect } from 'react'
import { Activity, Cpu, Network, Clock, Zap, Moon, Sun, Server, Database, Home, BarChart3 } from 'lucide-react'
import NodeStatus from './components/NodeStatus'
import MinerGrid from './components/MinerGrid'
import TaskMonitor from './components/TaskMonitor'
import TimeScheduler from './components/TimeScheduler'
import InferenceStats from './components/InferenceStats'
import P2PNetwork from './components/P2PNetwork'
import StellarIntegration from './components/StellarIntegration'
import Landing from './pages/Landing'
import StellarExample from './pages/StellarExample'

// Simple error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 text-red-400">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
            <pre className="text-left bg-gray-900 p-4 rounded text-sm overflow-auto max-h-60">
              {this.state.error?.toString()}
              {this.state.error?.stack}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const [nodeStatus, setNodeStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState('landing')
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    console.log('[App] useEffect - starting fetchStatus')
    const fetchStatus = async () => {
      try {
        console.log('[App] Fetching http://localhost:3000/api/status')
        const response = await fetch('http://localhost:3000/api/status')
        console.log('[App] Response status:', response.status)
        const result = await response.json()
        console.log('[App] Result:', result)
        
        if (result.success && result.data) {
          setNodeStatus(result.data)
          setFetchError(null)
        } else {
          console.error('API returned error:', result.error)
          setFetchError(result.error)
        }
      } catch (error) {
        console.error('Error fetching status:', error)
        setFetchError(error.message)
      } finally {
        setLoading(false)
        console.log('[App] Loading false, nodeStatus:', !!nodeStatus)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Show landing page with Stellar Example inline
  if (currentView === 'landing') {
    console.log('[App] Rendering Landing')
    return (
      <ErrorBoundary>
        <Landing onNavigateToDashboard={() => setCurrentView('dashboard')} />
      </ErrorBoundary>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 animate-spin mx-auto mb-4 text-primary-500" />
          <p className="text-dark-300">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
        {/* Header */}
        <header className="border-b border-dark-700 bg-dark-800/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">QVAC-Pear Miner Node</h1>
                  <p className="text-sm text-dark-400">Distributed AI Inference & Mining Dashboard</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('landing')}
                  className="flex items-center gap-2 px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors"
                >
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">Home</span>
                </button>
                <div className="flex items-center gap-2 text-sm">
                  <Server className="w-4 h-4 text-primary-400" />
                  <span className="text-dark-300">ID: {nodeStatus?.nodeId?.substring(0, 8)}...</span>
                </div>
                <div className={`status-badge ${nodeStatus?.running ? 'status-running' : 'status-stopped'}`}>
                  {nodeStatus?.running ? 'Running' : 'Stopped'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8">
          {/* Top Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <Cpu className="w-8 h-8 text-primary-400" />
                <span className="text-2xl font-bold text-white">{nodeStatus?.mining?.minerStatus ? Object.keys(nodeStatus.mining.minerStatus).length : 0}</span>
              </div>
              <p className="text-sm text-dark-400">Active Miners</p>
              <p className="text-xs text-primary-400 mt-1">Parallel Monitoring</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <Activity className="w-8 h-8 text-green-400" />
                <span className="text-2xl font-bold text-white">{nodeStatus?.inference?.activeRequests || 0}</span>
              </div>
              <p className="text-sm text-dark-400">Active Requests</p>
              <p className="text-xs text-green-400 mt-1">Max: {nodeStatus?.inference?.maxConcurrent || 4}</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <Network className="w-8 h-8 text-blue-400" />
                <span className="text-2xl font-bold text-white">{nodeStatus?.p2p?.peerCount || 0}</span>
              </div>
              <p className="text-sm text-dark-400">P2P Peers</p>
              <p className="text-xs text-blue-400 mt-1">Pear Network</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <Database className="w-8 h-8 text-purple-400" />
                <span className="text-2xl font-bold text-white">{nodeStatus?.tasks?.minerListeners || 0}</span>
              </div>
              <p className="text-sm text-dark-400">Task Listeners</p>
              <p className="text-xs text-purple-400 mt-1">Real-time Monitoring</p>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              <NodeStatus status={nodeStatus} />
              <MinerGrid miners={nodeStatus?.mining?.minerStatus} />
              <TaskMonitor tasks={nodeStatus?.tasks} />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <TimeScheduler mode={nodeStatus?.mode} />
              <InferenceStats inference={nodeStatus?.inference} />
              <P2PNetwork p2p={nodeStatus?.p2p} />
            </div>
          </div>

          {/* Stellar Integration */}
          <StellarIntegration mode={nodeStatus?.mode} />
        </main>
      </div>
    </ErrorBoundary>
  )
}

export default App