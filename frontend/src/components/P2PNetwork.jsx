import { Network, Users, Globe, Shield } from 'lucide-react'

export default function P2PNetwork({ p2p }) {
  if (!p2p) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Network className="w-5 h-5 text-primary-400" />
          Pear P2P Network
        </h2>
        <div className={`status-badge ${p2p?.running ? 'status-running' : 'status-stopped'}`}>
          {p2p?.running ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-dark-300">Connected Peers</span>
          </div>
          <span className="text-lg font-bold text-white">{p2p?.peerCount || 0}</span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-green-400" />
            <span className="text-sm text-dark-300">Peer Discovery</span>
          </div>
          <span className={`text-sm font-medium ${p2p?.discovery ? 'text-green-400' : 'text-red-400'}`}>
            {p2p?.discovery ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-dark-300">Network Status</span>
          </div>
          <span className="text-sm font-medium text-green-400">Secure</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-dark-900/50 rounded-lg">
            <Network className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-dark-300">Hyperswarm DHT</span>
            <span className="ml-auto text-xs text-green-400">Active</span>
          </div>

          <div className="flex items-center gap-2 p-3 bg-dark-900/50 rounded-lg">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-dark-300">NAT Traversal</span>
            <span className="ml-auto text-xs text-green-400">Enabled</span>
          </div>

          <div className="flex items-center gap-2 p-3 bg-dark-900/50 rounded-lg">
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-dark-300">Encryption</span>
            <span className="ml-auto text-xs text-green-400">AES-256</span>
          </div>
        </div>

        <div className="p-3 bg-primary-500/10 border border-primary-500/30 rounded-lg">
          <p className="text-xs text-primary-300">
            <strong className="text-primary-400">Zero Infrastructure:</strong> P2P network operates 
            without cloud servers using Pear Runtime and Hyperswarm.
          </p>
        </div>
      </div>
    </div>
  )
}
