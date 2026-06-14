import { Cpu, Activity, Eye, Zap } from 'lucide-react'

const minerConfig = {
  cortensor: {
    name: 'Cortensor',
    description: 'Decentralized AI Network',
    icon: Zap,
    color: 'text-purple-400'
  },
  chutes: {
    name: 'Chutes',
    description: 'GPU Mining',
    icon: Cpu,
    color: 'text-blue-400'
  },
  fortytwo: {
    name: 'Fortytwo',
    description: 'AI Inference Network',
    icon: Activity,
    color: 'text-green-400'
  },
  earnidle: {
    name: 'Earnidle',
    description: 'Idle Compute Protocol',
    icon: Eye,
    color: 'text-orange-400'
  }
}

export default function MinerGrid({ miners }) {
  if (!miners) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary-400" />
          Parallel Miner Monitoring
        </h2>
        <div className="status-badge status-monitoring">
          Monitoring Mode
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(miners).map(([key, miner]) => {
          const config = minerConfig[key]
          const Icon = config.icon

          return (
            <div key={key} className="bg-dark-900/50 rounded-lg p-4 border border-dark-700 hover:border-primary-500/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-dark-800 rounded-lg flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{config.name}</h3>
                    <p className="text-xs text-dark-400">{config.description}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${miner.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-400">Status</span>
                  <span className={miner.running ? 'text-green-400' : 'text-red-400'}>
                    {miner.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-400">Mode</span>
                  <span className={miner.monitoringMode ? 'text-blue-400' : 'text-dark-300'}>
                    {miner.monitoringMode ? 'Monitoring' : 'Active'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-400">Task Detection</span>
                  <span className="text-primary-400">
                    {miner.running && miner.monitoringMode ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 p-4 bg-primary-500/10 border border-primary-500/30 rounded-lg">
        <p className="text-sm text-primary-300">
          <strong className="text-primary-400">Parallel Mode:</strong> All miners run simultaneously, 
          monitoring for inference tasks in real-time. When a task arrives, all miners are notified immediately.
        </p>
      </div>
    </div>
  )
}
