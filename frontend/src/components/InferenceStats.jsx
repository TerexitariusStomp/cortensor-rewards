import { Zap, Activity, Clock, Cpu } from 'lucide-react'

export default function InferenceStats({ inference }) {
  if (!inference) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary-400" />
          QVAC Inference
        </h2>
        <div className={`status-badge ${inference?.running ? 'status-running' : 'status-stopped'}`}>
          {inference?.running ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-sm text-dark-300">Active Requests</span>
          </div>
          <span className="text-lg font-bold text-white">{inference?.activeRequests || 0}</span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-dark-300">Max Concurrent</span>
          </div>
          <span className="text-lg font-bold text-white">{inference?.maxConcurrent || 4}</span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-dark-300">Idle Status</span>
          </div>
          <span className={`text-sm font-medium ${inference?.idle ? 'text-green-400' : 'text-orange-400'}`}>
            {inference?.idle ? 'Idle' : 'Active'}
          </span>
        </div>

        <div className="p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-dark-300">Configured Models</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-dark-800 rounded text-xs text-primary-400">llama-2-7b</span>
            <span className="px-2 py-1 bg-dark-800 rounded text-xs text-primary-400">llama-2-13b</span>
          </div>
        </div>

        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-xs text-green-300">
            <strong className="text-green-400">Task Registration:</strong> All inference tasks are 
            automatically registered with TaskMonitor for immediate miner notification.
          </p>
        </div>
      </div>
    </div>
  )
}
