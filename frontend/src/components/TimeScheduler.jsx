import { Clock, Sun, Moon, Calendar } from 'lucide-react'

export default function TimeScheduler({ mode }) {
  if (!mode) return null

  const isNight = mode.isNight
  const isDay = mode.isDay

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary-400" />
          Time Scheduler
        </h2>
        <div className={`status-badge ${isNight ? 'status-monitoring' : 'status-running'}`}>
          {isNight ? 'Night' : 'Day'}
        </div>
      </div>

      <div className="space-y-4">
        <div className={`p-4 rounded-lg border ${isNight ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
          <div className="flex items-center gap-3 mb-3">
            {isNight ? (
              <Moon className="w-6 h-6 text-indigo-400" />
            ) : (
              <Sun className="w-6 h-6 text-orange-400" />
            )}
            <div>
              <h3 className="font-medium text-white">
                {isNight ? 'Night Mode' : 'Day Mode'}
              </h3>
              <p className="text-xs text-dark-400">
                {isNight ? '8 PM - 6 AM' : '6 AM - 8 PM'}
              </p>
            </div>
          </div>

          <div className="text-sm text-dark-300">
            {isNight ? (
              <p>Stellar app active for astronomy observations. Miners monitoring in background.</p>
            ) : (
              <p>Inference earning active. All miners monitoring for tasks.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-dark-300">Day Start</span>
            </div>
            <span className="text-sm font-mono text-white">6:00 AM</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-dark-300">Night Start</span>
            </div>
            <span className="text-sm font-mono text-white">8:00 PM</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-dark-300">Timezone</span>
            </div>
            <span className="text-sm font-mono text-white">UTC</span>
          </div>
        </div>

        <div className="p-3 bg-primary-500/10 border border-primary-500/30 rounded-lg">
          <p className="text-xs text-primary-300">
            <strong className="text-primary-400">Auto-switching:</strong> Mode changes automatically based on time. 
            Checks every minute for transitions.
          </p>
        </div>
      </div>
    </div>
  )
}
