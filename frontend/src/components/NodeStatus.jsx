import { Server, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function NodeStatus({ status }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="w-5 h-5 text-primary-400" />
          Node Status
        </h2>
        <div className={`status-badge ${status?.running ? 'status-running' : 'status-stopped'}`}>
          {status?.running ? 'Running' : 'Stopped'}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm text-dark-300">Node Status</span>
          </div>
          <span className={`text-sm font-medium ${status?.running ? 'text-green-400' : 'text-red-400'}`}>
            {status?.running ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-dark-300">Node ID</span>
          </div>
          <span className="text-sm font-mono text-primary-400">
            {status?.nodeId?.substring(0, 16)}...
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-dark-300">Uptime</span>
          </div>
          <span className="text-sm font-medium text-blue-400">
            {status?.running ? 'Active' : 'N/A'}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-dark-300">Components</span>
          </div>
          <span className="text-sm font-medium text-green-400">
            All Systems Operational
          </span>
        </div>
      </div>
    </div>
  )
}
