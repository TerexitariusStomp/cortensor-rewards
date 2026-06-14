import { Moon, Sun, Star, Camera, Award, Zap } from 'lucide-react'

export default function StellarIntegration({ mode }) {
  const isNight = mode?.isNight

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-primary-400" />
          Stellar App Integration
        </h2>
        <div className={`status-badge ${isNight ? 'status-monitoring' : 'status-stopped'}`}>
          {isNight ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Night Mode */}
        <div className={`p-6 rounded-lg border ${isNight ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-dark-900/50 border-dark-700'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Moon className={`w-6 h-6 ${isNight ? 'text-indigo-400' : 'text-dark-500'}`} />
            <h3 className="font-medium text-white">Night Mode</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Camera className={`w-4 h-4 ${isNight ? 'text-indigo-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${isNight ? 'text-dark-200' : 'text-dark-500'}`}>Sky Sensing</span>
            </div>

            <div className="flex items-center gap-2">
              <Star className={`w-4 h-4 ${isNight ? 'text-indigo-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${isNight ? 'text-dark-200' : 'text-dark-500'}`}>Celestial Photography</span>
            </div>

            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${isNight ? 'text-indigo-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${isNight ? 'text-dark-200' : 'text-dark-500'}`}>On-Device AI Processing</span>
            </div>

            <div className="flex items-center gap-2">
              <Award className={`w-4 h-4 ${isNight ? 'text-indigo-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${isNight ? 'text-dark-200' : 'text-dark-500'}`}>Stellar Token Rewards</span>
            </div>
          </div>

          {isNight && (
            <div className="mt-4 p-3 bg-indigo-500/20 border border-indigo-500/30 rounded-lg">
              <p className="text-xs text-indigo-300">
                Stellar app is currently active for dark-sky observations
              </p>
            </div>
          )}
        </div>

        {/* Day Mode */}
        <div className={`p-6 rounded-lg border ${!isNight ? 'bg-orange-500/10 border-orange-500/30' : 'bg-dark-900/50 border-dark-700'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Sun className={`w-6 h-6 ${!isNight ? 'text-orange-400' : 'text-dark-500'}`} />
            <h3 className="font-medium text-white">Day Mode</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${!isNight ? 'text-orange-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${!isNight ? 'text-dark-200' : 'text-dark-500'}`}>Inference Earning</span>
            </div>

            <div className="flex items-center gap-2">
              <Star className={`w-4 h-4 ${!isNight ? 'text-orange-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${!isNight ? 'text-dark-200' : 'text-dark-500'}`}>Parallel Miner Monitoring</span>
            </div>

            <div className="flex items-center gap-2">
              <Camera className={`w-4 h-4 ${!isNight ? 'text-orange-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${!isNight ? 'text-dark-200' : 'text-dark-500'}`}>Immediate Task Detection</span>
            </div>

            <div className="flex items-center gap-2">
              <Award className={`w-4 h-4 ${!isNight ? 'text-orange-400' : 'text-dark-500'}`} />
              <span className={`text-sm ${!isNight ? 'text-dark-200' : 'text-dark-500'}`}>Multi-Miner Rewards</span>
            </div>
          </div>

          {!isNight && (
            <div className="mt-4 p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg">
              <p className="text-xs text-orange-300">
                Device available for inference earning with all miners monitoring
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-gradient-to-r from-indigo-500/10 to-orange-500/10 border border-primary-500/30 rounded-lg">
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-5 h-5 text-primary-400" />
          <h4 className="font-medium text-white">Stellar Integration</h4>
        </div>
        <p className="text-sm text-dark-300 mb-2">
          Automatic time-based resource allocation between Stellar astronomy app and inference earning.
        </p>
        <div className="flex items-center gap-4 text-xs text-dark-400">
          <span className="flex items-center gap-1">
            <Moon className="w-3 h-3 text-indigo-400" />
            Night: Sky Sensing
          </span>
          <span className="flex items-center gap-1">
            <Sun className="w-3 h-3 text-orange-400" />
            Day: Inference Earning
          </span>
        </div>
      </div>
    </div>
  )
}
