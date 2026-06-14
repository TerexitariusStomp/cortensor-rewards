import { Activity, Bell, CheckCircle, Clock } from 'lucide-react'

export default function TaskMonitor({ tasks }) {
  if (!tasks) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-400" />
          Task Monitor
        </h2>
        <div className={`status-badge ${tasks?.running ? 'status-running' : 'status-stopped'}`}>
          {tasks?.running ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-dark-900/50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">{tasks?.activeTasks || 0}</div>
          <div className="text-xs text-dark-400">Active Tasks</div>
        </div>
        <div className="bg-dark-900/50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">{tasks?.totalTasks || 0}</div>
          <div className="text-xs text-dark-400">Total Processed</div>
        </div>
        <div className="bg-dark-900/50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white mb-1">{tasks?.minerListeners || 0}</div>
          <div className="text-xs text-dark-400">Miner Listeners</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg">
          <Bell className="w-4 h-4 text-primary-400" />
          <div className="flex-1">
            <p className="text-sm text-white">Real-time Task Detection</p>
            <p className="text-xs text-dark-400">Immediate notification to all miners</p>
          </div>
          <CheckCircle className="w-4 h-4 text-green-400" />
        </div>

        <div className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg">
          <Clock className="w-4 h-4 text-blue-400" />
          <div className="flex-1">
            <p className="text-sm text-white">Task Lifecycle Tracking</p>
            <p className="text-xs text-dark-400">From registration to completion</p>
          </div>
          <CheckCircle className="w-4 h-4 text-green-400" />
        </div>

        <div className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg">
          <Activity className="w-4 h-4 text-purple-400" />
          <div className="flex-1">
            <p className="text-sm text-white">Automatic Cleanup</p>
            <p className="text-xs text-dark-400">Completed tasks removed after 1 minute</p>
          </div>
          <CheckCircle className="w-4 h-4 text-green-400" />
        </div>
      </div>

      {tasks?.activeTasks === 0 && (
        <div className="mt-4 p-4 bg-dark-900/30 rounded-lg text-center">
          <Clock className="w-8 h-8 text-dark-500 mx-auto mb-2" />
          <p className="text-sm text-dark-400">No active inference tasks</p>
          <p className="text-xs text-dark-500 mt-1">Miners standing by for incoming tasks</p>
        </div>
      )}
    </div>
  )
}
