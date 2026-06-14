import { useState, useRef } from 'react'
import { 
  Moon, 
  Sun, 
  Star, 
  Camera, 
  Award, 
  Zap, 
  Cpu, 
  Activity, 
  ArrowLeft, 
  CheckCircle,
  Clock,
  Home,
  BarChart3,
  Download,
  Settings,
  Code,
  Book,
  Shield,
  HelpCircle,
  Smartphone,
  WifiOff,
  Mic,
  MapPin,
  Target,
  Globe,
  Brain,
  Volume2,
  Search,
  Menu,
  X,
  ChevronRight,
  Layers,
  Compass,
  Cloud,
  Thermometer,
  Eye,
  Layers as LayersIcon,
  Sparkles,
  Lock,
  Network,
  Database
} from 'lucide-react'

// Stellar Field App Screens - simulating the actual app UI
const APP_SCREENS = {
  home: {
    title: 'Home',
    icon: Home,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-100">Welcome back</p>
              <h2 className="text-lg font-bold text-white">Ready to observe?</h2>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Star className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Visible" value="7" icon={Eye} color="blue" />
          <StatCard label="Bortle" value="3" icon={Cloud} color="green" />
          <StatCard label="Dark Window" value="4h 22m" icon={Moon} color="purple" />
        </div>

        {/* Tonight's Targets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-yellow-400" />
              Tonight's Targets
            </h3>
            <span className="text-xs text-gray-400">Tap for details</span>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Jupiter', alt: '38°', mag: '-2.1', visible: true, reward: '+75 ✦' },
              { name: 'Saturn', alt: '22°', mag: '0.7', visible: true, reward: '+100 ✦' },
              { name: 'Moon', alt: '45°', mag: '-11.2', visible: true, reward: '+50 ✦' },
              { name: 'Orion Nebula', alt: '31°', mag: '4.0', visible: true, reward: '+100 ✦' },
              { name: 'Andromeda', alt: '28°', mag: '3.4', visible: true, reward: '+175 ✦' },
            ].map((target, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <Star className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{target.name}</p>
                    <p className="text-xs text-gray-400">Alt: {target.alt} • Mag: {target.mag}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-400">{target.reward}</p>
                  <p className="text-xs text-gray-500">Mission</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <ActionButton icon={Camera} label="Photograph" color="blue" />
          <ActionButton icon={Mic} label="Voice Log" color="purple" />
          <ActionButton icon={Book} label="Field Guide" color="green" />
          <ActionButton icon={LayersIcon} label="Missions" color="orange" />
        </div>
      </div>
    )
  },
  sky: {
    title: 'Sky',
    icon: Globe,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* Location & Conditions */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-white" />
              <span className="text-white font-medium">Tbilisi, Georgia</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-blue-100">
              <WifiOff className="w-3 h-3" />
              <span>Offline Mode</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <ConditionCard label="Clouds" value="12%" icon={Cloud} />
            <ConditionCard label="Seeing" value="7/10" icon={Eye} />
            <ConditionCard label="Transparency" value="8/10" icon={Thermometer} />
            <ConditionCard label="Bortle" value="Class 3" icon={Sparkles} />
          </div>
        </div>

        {/* Planet Positions */}
        <div>
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Live Planet Positions
          </h3>
          <div className="space-y-2">
            {[
              { planet: 'Jupiter', alt: '38°', az: '142°', mag: '-2.1', rise: '14:22', set: '03:45', visible: true },
              { planet: 'Saturn', alt: '22°', az: '118°', mag: '0.7', rise: '16:10', set: '05:30', visible: true },
              { planet: 'Mars', alt: '-12°', az: '89°', mag: '1.2', rise: '08:45', set: '21:30', visible: false },
              { planet: 'Venus', alt: '-34°', az: '267°', mag: '-4.1', rise: '05:15', set: '19:20', visible: false },
              { planet: 'Moon', alt: '45°', az: '180°', mag: '-11.2', rise: '13:40', set: '02:10', visible: true },
            ].map((p, i) => (
              <PlanetRow key={i} planet={p} />
            ))}
          </div>
        </div>

        {/* Dark Window */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-yellow-400" />
              Dark Window
            </h3>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Active Now</span>
          </div>
          <div className="h-16 bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 rounded-lg relative overflow-hidden">
            <div className="absolute top-2 left-2 right-2 flex justify-between text-xs text-gray-300">
              <span>20:00</span>
              <span>02:00</span>
              <span>06:00</span>
            </div>
            <div className="absolute bottom-0 left-1/4 right-1/4 top-6 bg-yellow-400/20 rounded" />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-yellow-300 font-medium">
              Best: 22:30 - 04:15
            </div>
          </div>
        </div>
      </div>
    )
  },
  missions: {
    title: 'Missions',
    icon: Target,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* Progress Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-orange-100">Progress to Free Telescope</p>
              <h2 className="text-xl font-bold text-white">2 / 7 Missions Complete</h2>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Award className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white w-[28.5%]" />
          </div>
          <p className="text-xs text-orange-100 mt-1">Complete all 7 → Free telescope from Astroman</p>
        </div>

        {/* Mission List */}
        <div className="space-y-2">
          {[
            { name: 'Moon', reward: '+50 ✦', status: 'completed', desc: 'Photographed waxing crescent' },
            { name: 'Jupiter', reward: '+75 ✦', status: 'completed', desc: 'Captured at 38° altitude' },
            { name: 'Pleiades', reward: '+60 ✦', status: 'available', desc: 'Naked-eye cluster observation' },
            { name: 'Orion Nebula', reward: '+100 ✦', status: 'available', desc: 'Telescope required (4"+)' },
            { name: 'Saturn', reward: '+100 ✦', status: 'available', desc: 'Ring detail at 22°' },
            { name: 'Andromeda', reward: '+175 ✦', status: 'available', desc: 'Galaxy at Bortle ≤4' },
            { name: 'Crab Nebula', reward: '+250 ✦', status: 'locked', desc: 'Expert: 8"+ aperture, Bortle ≤4' },
          ].map((m, i) => (
            <MissionCard key={i} mission={m} />
          ))}
        </div>
      </div>
    )
  },
  ai: {
    title: 'Astra AI',
    icon: Brain,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* AI Mode Indicator */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-white" />
              <span className="font-semibold text-white">Astra AI Companion</span>
            </div>
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Offline • Llama 3.2 1B</span>
          </div>
          <p className="text-sm text-green-100">On-device AI via QVAC • 72-chunk astronomy corpus • Works at dark sites</p>
        </div>

        {/* Chat Interface */}
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          <ChatMessage 
            sender="ai" 
            content="Welcome to Stellar Field! I'm Astra, your on-device astronomy companion. Ask me about tonight's targets, telescope settings, or constellation mythology." 
            time="9:41"
          />
          <ChatMessage 
            sender="user" 
            content={`What's the best target for my 6" dobsonian tonight?`} 
            time="9:42"
          />
          <ChatMessage 
            sender="ai" 
            content={`For a 6" dobsonian at Bortle 3, Jupiter is perfectly positioned at 38° altitude (mag -2.1). Saturn at 22° shows ring detail. The Orion Nebula (M42) at 31° will reveal the Trapezium cluster. Want a finder chart for any of these?`} 
            time="9:42"
            citations={['Messier Catalog', 'Sky Tonight Data']}
          />
        </div>

        {/* Quick Prompts */}
        <div>
          <p className="text-xs text-gray-400 mb-2">Quick Questions</p>
          <div className="flex flex-wrap gap-2">
            {[
              'Where is Jupiter?',
              'Best eyepiece for Saturn?',
              'How to find Andromeda?',
              'Moon phase tonight?',
              'Bortle scale explained'
            ].map((q, i) => (
              <button key={i} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-full text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-950 to-transparent pb-8">
          <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl p-2 border border-gray-700">
            <button className="p-2 text-gray-400 hover:text-white"><Mic className="w-4 h-4" /></button>
            <input type="text" placeholder="Ask Astra..." className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none" />
            <button className="p-2 text-indigo-400 hover:text-indigo-300"><ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    )
  },
  camera: {
    title: 'Camera',
    icon: Camera,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* Camera Viewfinder */}
        <div className="aspect-[4/3] bg-gray-900 rounded-xl overflow-hidden relative border border-gray-700">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Camera className="w-16 h-16 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Camera Viewfinder</p>
              <p className="text-xs">Point at Jupiter • 38° alt</p>
            </div>
          </div>
          
          {/* Overlay Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 border-2 border-white/50 rounded-lg" />
            <div className="absolute w-4 h-0.5 bg-white left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" />
            <div className="absolute h-4 w-0.5 bg-white left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" />
          </div>

          {/* Target Info Overlay */}
          <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur rounded-lg p-3 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="font-medium">Jupiter</p>
                  <p className="text-xs text-gray-400">Alt: 38° • Az: 142° • Mag: -2.1</p>
                </div>
              </div>
              <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">In Frame ✓</span>
            </div>
            <div className="mt-2 flex gap-2 text-xs text-gray-400">
              <span>ISO 800</span>
              <span>1/4s</span>
              <span>f/1.8</span>
              <span>GPS ✓</span>
              <span>EXIF ✓</span>
            </div>
          </div>
        </div>

        {/* Capture Controls */}
        <div className="flex items-center justify-center gap-6 pb-8">
          <button className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl">
            <Camera className="w-8 h-8 text-gray-900" />
          </button>
        </div>

        {/* Verification Preview */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400" />
            Verification Pipeline
          </h3>
          <div className="space-y-2 text-sm">
            <VerificationStep label="GPS + Timestamp" status="verified" />
            <VerificationStep label="EXIF Data Match" status="verified" />
            <VerificationStep label="Sky Oracle Hash" status="pending" />
            <VerificationStep label="Claude Vision Check" status="pending" />
            <VerificationStep label="Cross-wallet Dedup" status="pending" />
          </div>
        </div>
      </div>
    )
  },
  learn: {
    title: 'Learn',
    icon: Book,
    render: () => (
      <div className="space-y-4 pb-24">
        {/* Field Guide Sections */}
        <div className="space-y-3">
          {[
            { title: 'Solar System', icon: Globe, desc: 'Tap a planet • take a quiz', items: ['Jupiter', 'Moon', 'Mercury', 'Venus', 'Mars', 'Saturn', 'Uranus'], reward: '+100 ★' },
            { title: 'Constellations', icon: Sparkles, desc: 'Seasonal guides • mythology', items: ['Orion', 'Ursa Major', 'Cassiopeia', 'Scorpius', 'Cygnus'], reward: '+100 ★' },
            { title: 'Deep Sky', icon: Star, desc: 'Messier & Caldwell objects', items: ['M31 Andromeda', 'M42 Orion', 'M45 Pleiades', 'M13 Hercules', 'M51 Whirlpool'], reward: '+150 ★' },
            { title: 'Telescope Basics', icon: Settings, desc: 'Eyepieces • collimation • accessories', items: ['Magnification calc', 'Exit pupil', 'Barlow lenses', 'Filters', 'Alignment'], reward: '+75 ★' },
          ].map((section, i) => (
            <LearnSection key={i} section={section} />
          ))}
        </div>
      </div>
    )
  }
}

// Helper Components
function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  }
  return (
    <div className={`p-3 rounded-lg border ${colors[color]}`}>
      <Icon className="w-4 h-4 mx-auto mb-1" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-75">{label}</p>
    </div>
  )
}

function ConditionCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white/10 rounded-lg p-2">
      <Icon className="w-4 h-4 mx-auto mb-1 text-gray-300" />
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  )
}

function PlanetRow({ planet }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${planet.visible ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-900/30 border-gray-800 opacity-60'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${planet.visible ? 'bg-yellow-500/20' : 'bg-gray-700'}`}>
          <Star className={`w-4 h-4 ${planet.visible ? 'text-yellow-400' : 'text-gray-500'}`} />
        </div>
        <div>
          <p className={`font-medium ${planet.visible ? 'text-white' : 'text-gray-500'}`}>{planet.planet}</p>
          <p className="text-xs text-gray-500">Alt: {planet.alt} • Az: {planet.az}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm ${planet.visible ? 'text-green-400' : 'text-gray-500'}`}>
          {planet.visible ? 'Visible' : 'Below Horizon'}
        </p>
        <p className="text-xs text-gray-500">Mag: {planet.mag}</p>
      </div>
    </div>
  )
}

function ActionButton({ icon: Icon, label, color }) {
  const colors = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400 hover:bg-purple-500/30',
    green: 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30',
    orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400 hover:bg-orange-500/30',
  }
  return (
    <button className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-colors ${colors[color]}`}>
      <Icon className="w-5 h-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

function MissionCard({ mission }) {
  const statusStyles = {
    completed: 'bg-green-500/20 border-green-500/30',
    available: 'bg-gray-800/50 border-gray-700',
    locked: 'bg-gray-900/50 border-gray-800 opacity-50',
  }
  const statusIcons = {
    completed: <CheckCircle className="w-5 h-5 text-green-400" />,
    available: <Target className="w-5 h-5 text-yellow-400" />,
    locked: <Shield className="w-5 h-5 text-gray-500" />,
  }
  return (
    <div className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${statusStyles[mission.status]}`}>
      <div className="flex items-center gap-3">
        {statusIcons[mission.status]}
        <div>
          <p className={`font-medium ${mission.status === 'locked' ? 'text-gray-500' : 'text-white'}`}>{mission.name}</p>
          <p className="text-xs text-gray-400">{mission.desc}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${mission.status === 'completed' ? 'text-green-400' : mission.status === 'available' ? 'text-yellow-400' : 'text-gray-500'}`}>
          {mission.reward}
        </p>
        <p className="text-xs text-gray-500">
          {mission.status === 'completed' ? 'Done' : mission.status === 'available' ? 'Available' : 'Locked'}
        </p>
      </div>
    </div>
  )
}

function ChatMessage({ sender, content, time, citations }) {
  return (
    <div className={`flex gap-2 ${sender === 'user' ? 'justify-end' : ''}`}>
      <div className={`max-w-[75%] ${sender === 'user' ? 'order-2' : 'order-1'}`}>
        <div className={`${sender === 'user' ? 'bg-indigo-600' : 'bg-gray-800'} rounded-2xl px-4 py-2`}>
          <p className="text-sm text-white">{content}</p>
          {citations && (
            <div className="flex flex-wrap gap-1 mt-2">
              {citations.map((c, i) => (
                <span key={i} className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-gray-300">{c}</span>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">{time}</p>
      </div>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sender === 'user' ? 'bg-indigo-500 order-1' : 'bg-gray-700 order-2'}`}>
        {sender === 'user' ? <span className="text-xs font-bold text-white">U</span> : <Brain className="w-4 h-4 text-green-400" />}
      </div>
    </div>
  )
}

function VerificationStep({ label, status }) {
  const statusConfig = {
    verified: { icon: CheckCircle, color: 'text-green-400', label: 'Verified' },
    pending: { icon: Activity, color: 'text-yellow-400', label: 'Pending', animate: true },
    failed: { icon: X, color: 'text-red-400', label: 'Failed' },
  }
  const cfg = statusConfig[status]
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        <cfg.icon className={`w-4 h-4 ${cfg.color} ${cfg.animate ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
      </div>
    </div>
  )
}

function LearnSection({ section }) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <section.icon className="w-5 h-5 text-indigo-400" />
            <h4 className="font-semibold text-white">{section.title}</h4>
          </div>
          <span className="text-xs text-yellow-400 font-medium">{section.reward}</span>
        </div>
        <p className="text-xs text-gray-400 mb-3">{section.desc}</p>
        <div className="flex flex-wrap gap-1">
          {section.items.map((item, i) => (
            <span key={i} className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-full text-xs text-gray-300">{item}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureRow({ icon: Icon, color, title, desc }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  }
  return (
    <div className="flex items-start gap-3 p-3 bg-dark-900/50 rounded-lg">
      <Icon className={`w-5 h-5 ${colors[color]} flex-shrink-0 mt-0.5 rounded-lg p-1`} />
      <div>
        <h4 className="font-medium text-white">{title}</h4>
        <p className="text-sm text-dark-400">{desc}</p>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-dark-900/50 rounded-lg">
      <Icon className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="font-medium text-white">{title}</h4>
        <p className="text-sm text-dark-300">{desc}</p>
      </div>
    </div>
  )
}

function DocStep({ number, title, desc, link, linkText }) {
  return (
    <div className="flex items-start gap-4 p-4 bg-dark-900/50 rounded-lg">
      <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">{number}</div>
      <div className="flex-1">
        <h4 className="font-medium text-white mb-1">{title}</h4>
        <p className="text-sm text-dark-300">{desc}</p>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-400 hover:text-primary-300 inline-block mt-1">
            {linkText}
          </a>
        )}
      </div>
    </div>
  )
}

function DocItem({ icon: Icon, color, title, desc }) {
  const colors = {
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  }
  return (
    <div className="flex items-start gap-3 p-4 bg-dark-900/50 rounded-lg">
      <Icon className={`w-5 h-5 ${colors[color]} flex-shrink-0 mt-0.5 rounded-lg p-1`} />
      <div>
        <h4 className="font-medium text-white mb-1">{title}</h4>
        <p className="text-sm text-dark-300">{desc}</p>
      </div>
    </div>
  )
}

function ArchItem({ icon: Icon, color, title, desc, verified }) {
  const colors = {
    primary: 'text-primary-400 bg-primary-500/10',
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/10',
  }
  return (
    <div className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg">
      <Icon className={`w-5 h-5 ${colors[color]} flex-shrink-0 rounded-lg p-1`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{title}</p>
        <p className="text-xs text-dark-400">{desc}</p>
      </div>
      {verified && (
        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
      )}
    </div>
  )
}

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-dark-900/50 rounded-lg border border-dark-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <h4 className="font-medium text-white pr-4">{question}</h4>
        <ChevronRight className={`w-5 h-5 text-dark-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className={`${open ? 'block' : 'hidden'} px-4 pb-4 border-t border-dark-700`}>
        <p className="text-sm text-dark-300">{answer}</p>
      </div>
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-dark-800/50 backdrop-blur-sm border border-dark-700 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  )
}

const screens = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'sky', icon: Globe, label: 'Sky' },
  { id: 'missions', icon: Target, label: 'Missions' },
  { id: 'ai', icon: Brain, label: 'Astra AI' },
  { id: 'camera', icon: Camera, label: 'Camera' },
  { id: 'learn', icon: Book, label: 'Learn' },
]

const bottomNavScreens = ['home', 'sky', 'missions', 'ai', 'learn']

export default function StellarExample({ onNavigateBack, onNavigateToDashboard }) {
  const [activeScreen, setActiveScreen] = useState('home')
  const phoneRef = useRef(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
      {/* Navigation */}
      <nav className="border-b border-dark-700 bg-dark-800/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigateBack && onNavigateBack()}
                className="p-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Star className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Stellar Field Integration</h1>
                <p className="text-sm text-dark-400">Interactive Phone Emulator • Native Android App • Embed & Earn • Documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onNavigateToDashboard && onNavigateToDashboard()}
                className="flex items-center gap-2 px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
              <button
                onClick={() => onNavigateBack && onNavigateBack()}
                className="flex items-center gap-2 px-3 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Single Page Scroll Layout */}
      <main className="container mx-auto px-6 py-12">
        
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto mb-16">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full mb-4">
                <Star className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-indigo-300">Tether Frontier Hackathon Winner — May 2026</span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-3">
                Stellar Field — Complete Integration Guide
              </h1>
              <p className="text-lg text-dark-300 max-w-2xl">
                Interactive phone emulator, embed & earn integration, and complete documentation — all in one page. 
                Scroll down to explore everything.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <a 
                href="https://github.com/Rezimod/Stellar" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Code className="w-4 h-4" />
                View on GitHub
              </a>
              <a 
                href="https://github.com/Rezimod/Stellar/releases/tag/v0.1.0-field" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download APK
              </a>
              <a 
                href="https://stellarrclub.vercel.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Globe className="w-4 h-4" />
                Live Web Demo
              </a>
            </div>
          </div>

          {/* Quick Nav Links */}
          <div className="flex gap-2 mb-12 flex-wrap">
            <a href="#phone-emulator" className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Phone Emulator
            </a>
            <a href="#embed-earn" className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Embed & Earn
            </a>
            <a href="#documentation" className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Book className="w-4 h-4" />
              Documentation
            </a>
          </div>
        </section>

        {/* ============================================ */}
        {/* 1. PHONE EMULATOR SECTION */}
        {/* ============================================ */}
        <section id="phone-emulator" className="max-w-6xl mx-auto mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-3 flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-primary-400" />
              Interactive Phone Emulator
            </h2>
            <p className="text-dark-400 max-w-2xl">
              Fully interactive demonstration of the Stellar Field native Android app — the offline-mode astronomy companion 
              powered by QVAC on-device AI. Click the bottom navigation tabs or use the desktop screen selector to explore all screens.
            </p>
          </div>

          {/* Phone Frame */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Phone Hardware Frame */}
              <div className="relative w-[340px] h-[680px] bg-gradient-to-b from-gray-900 to-black rounded-[44px] p-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] before:absolute before:top-2 before:left-1/2 before:-translate-x-1/2 before:w-24 before:h-4 before:bg-gray-900 before:rounded-b-xl before:z-10">
                {/* Screen */}
                <div className="w-full h-full bg-black rounded-[40px] overflow-hidden relative border border-gray-800">
                  {/* Android Status Bar */}
                  <div className="flex items-center justify-between px-4 py-2 bg-black border-b border-gray-800">
                    <span className="text-xs text-white font-medium">9:41</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-2.5 bg-green-400 rounded-sm" />
                      <div className="w-3.5 h-3.5 bg-white rounded-full" />
                      <div className="w-7 h-2.5 bg-white rounded-sm" />
                    </div>
                  </div>

                  {/* App Content Area */}
                  <div className="h-[calc(100%-60px)] overflow-hidden">
                    {APP_SCREENS[activeScreen]?.render()}
                  </div>

                  {/* Bottom Navigation Bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-2 py-2">
                    <div className="flex justify-around items-center">
                      {bottomNavScreens.map((screen) => {
                        const ScreenIcon = APP_SCREENS[screen].icon
                        return (
                          <button
                            key={screen}
                            onClick={() => setActiveScreen(screen)}
                            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                              activeScreen === screen
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            <ScreenIcon className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{APP_SCREENS[screen].title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Home Indicator */}
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/30 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Screen Selector (Desktop) */}
          <div className="flex justify-center gap-2 flex-wrap mb-12">
            {screens.map((screen) => {
              const ScreenIcon = screen.icon
              return (
                <button
                  key={screen.id}
                  onClick={() => setActiveScreen(screen.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeScreen === screen.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                  }`}
                >
                  <ScreenIcon className="w-3.5 h-3.5" />
                  {screen.label}
                </button>
              )
            })}
          </div>

          {/* App Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-indigo-400" />
              About Stellar Field
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <InfoRow icon={Smartphone} title="Native Android App" desc="Physical device only — QVAC native modules don't run on emulators or Expo Go" />
                <InfoRow icon={WifiOff} title="Offline-First" desc="Designed for dark-sky sites with zero cell signal — all AI runs locally" />
                <InfoRow icon={Brain} title="On-Device AI (QVAC)" desc="Llama 3.2 1B Q4_0 + 72-chunk astronomy corpus via @qvac/llm-llamacpp" />
                <InfoRow icon={Mic} title="Voice Logs" desc="Whisper transcription on-device (@qvac/transcription-whispercpp) for eyepiece observations" />
              </div>
              <div className="space-y-4">
                <InfoRow icon={Camera} title="Photo Verification" desc="GPS + EXIF + Sky Oracle hash → Claude Vision check → compressed NFT on Solana" />
                <InfoRow icon={Target} title="Sky Missions" desc="7-tier observation missions earning Stars (SPL token) redeemable at Astroman (Tbilisi)" />
                <InfoRow icon={LayersIcon} title="Field Mesh P2P" desc="Peer-to-peer model sharing at dark sites via Pear — no internet required" />
                <InfoRow icon={Globe} title="Live Ephemeris" desc="Real-time planet positions, moon conditions, dark window calculations via astronomy-engine" />
              </div>
            </div>

            {/* Hardware Requirements */}
            <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-400" />
                Verified Hardware Requirements
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium text-gray-300">Chipset</p>
                  <p className="text-gray-400">Snapdragon 7+ / Google Tensor / Cortex-A76+</p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-gray-300">RAM</p>
                  <p className="text-gray-400">6 GB+ (8 GB recommended for Vision)</p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-gray-300">Storage</p>
                  <p className="text-gray-400">~4 GB free (models + corpus)</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 2. EMBED & EARN INTEGRATION SECTION */}
        {/* ============================================ */}
        <section id="embed-earn" className="max-w-6xl mx-auto mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-3 flex items-center gap-3">
              <Zap className="w-8 h-8 text-primary-400" />
              Simple Embed & Earn Integration
            </h2>
            <p className="text-dark-400 text-center mb-8 max-w-2xl mx-auto">
              Add one script tag to your web app to enable idle compute contribution and earning. 
              No model configuration needed — inference runs locally on user's device, results are sent to tasker networks.
            </p>
          </div>

          {/* One-Line Integration */}
          <div className="card mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary-400" />
              One-Line Integration
            </h3>
            <p className="text-sm text-dark-400 mb-4">
              The embed script auto-detects idle compute and connects to mining networks. 
              No AI model specification required for regular apps — only mining nodes need explicit model config.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-300 overflow-x-auto relative">
              <button className="absolute top-3 right-3 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-white transition-colors">Copy</button>
              <pre className="pt-8">{`<script 
  src="https://cdn.qvac-pear.io/inference-embed.js"
  data-app-id="your-app-id"
  auto-install>
</script>`}</pre>
            </div>
          </div>

          {/* What Happens Automatically */}
          <div className="card mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              What Happens Automatically
            </h3>
            <div className="space-y-4">
              <FeatureRow icon={Download} color="blue" title="Auto Download" desc="Inference runtime downloads when user opts in — no upfront bundle size" />
              <FeatureRow icon={Zap} color="green" title="Zero Configuration" desc="No AI model specification needed — uses optimal local models automatically" />
              <FeatureRow icon={Activity} color="purple" title="Smart Resource Management" desc="Pauses earning when your app needs AI, resumes when idle" />
              <FeatureRow icon={Award} color="orange" title="Automatic Earning" desc="Earns from inference tasks (Cortensor, Fortytwo, Chutes, Earnidle) when idle" />
              <FeatureRow icon={Cpu} color="indigo" title="Local-First Inference" desc="All inference runs on user's device; results sent to tasker networks for validation" />
            </div>
          </div>

          {/* Advanced Configuration */}
          <div className="card">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-indigo-400" />
              Advanced JavaScript API (Optional)
            </h3>
            <p className="text-sm text-dark-400 mb-4">
              For more control over the integration lifecycle.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-primary-300 overflow-x-auto">
              <pre>{`// Initialize the inference embed
const inference = await QVACInference.init({
  appId: 'your-app-id',
  autoInstall: true,
  onStatusChange: (status) => {
    console.log('Inference status:', status);
  },
  onEarning: (amount) => {
    console.log('Earned:', amount);
  }
});

// When your app needs AI, pause earning
inference.pause();

// When your app is done, resume earning
inference.resume();

// Check if user is contributing
const isContributing = inference.isContributing();`}</pre>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* 3. DOCUMENTATION SECTION */}
        {/* ============================================ */}
        <section id="documentation" className="max-w-6xl mx-auto mb-20">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-3 flex items-center gap-3">
              <Book className="w-8 h-8 text-primary-400" />
              Documentation
            </h2>
            <p className="text-dark-400 max-w-2xl">
              Complete guide to integrating, securing, and understanding the QVAC-Pear Miner Node architecture.
            </p>
          </div>

          {/* Getting Started */}
          <div className="card mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Book className="w-5 h-5 text-primary-400" />
              Getting Started
            </h3>
            <div className="space-y-4">
              <DocStep number="1" title="Add the Embed Script" desc="Add the QVAC-Pear embed script to your app's HTML before the closing body tag. The script loads asynchronously." link="https://qvac.tether.io/" linkText="QVAC SDK Docs →" />
              <DocStep number="2" title="Configure Your App ID" desc="Get your app ID from the QVAC-Pear dashboard and add it to the script tag's data-app-id attribute." />
              <DocStep number="3" title="Enable Auto-Install" desc="The auto-install attribute allows the inference runtime to download automatically when users opt in. No manual setup required." />
              <DocStep number="4" title="Handle User Consent" desc="Users must explicitly opt in before compute contribution begins. Use the JavaScript API to show the consent prompt at the right time in your user journey." />
            </div>
          </div>

          {/* Security & Privacy */}
          <div className="card mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              Security & Privacy
            </h3>
            <div className="space-y-4">
              <DocItem icon={CheckCircle} color="green" title="User Consent Required" desc="Users must explicitly opt in before any compute contribution begins. No background installation without permission. Users can revoke consent at any time." />
              <DocItem icon={Cpu} color="blue" title="Local-First Inference" desc="All AI inference runs locally on the user's device using QVAC. No raw user data leaves the device during inference. Only inference results (task outputs) are transmitted to tasker networks." />
              <DocItem icon={Network} color="purple" title="Tasker Network Transmission" desc="Inference results are securely sent to mining/tasker networks (Cortensor, Fortytwo, Chutes, Earnidle) for task validation and reward distribution. This is how earning works — completed inference tasks are verified by the networks." />
              <DocItem icon={Activity} color="indigo" title="Transparent Resource Usage" desc="Users can see exactly when their compute is being used, which miner networks are active, and real-time earnings in the dashboard." />
              <DocItem icon={Lock} color="orange" title="No Model Config for Apps" desc="Regular apps don't specify AI models. The embed uses optimal local models automatically. Only dedicated mining nodes with specific hardware requirements need explicit model configuration." />
            </div>
          </div>

          {/* Architecture Accuracy */}
          <div className="card mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-indigo-400" />
              Backend Architecture (Verified)
            </h3>
            <p className="text-sm text-dark-400 mb-4">All features below are implemented in the actual backend codebase:</p>
            <div className="space-y-3">
              <ArchItem icon={Zap} color="primary" title="QVAC Inference Layer" desc="Local AI processing with multiple model support (config: inference.qvac.models)" verified={true} />
              <ArchItem icon={Database} color="green" title="Hypercore Storage" desc="Distributed append-only log with replication (config: p2p.hypercore.replicate: true)" verified={true} />
              <ArchItem icon={Network} color="blue" title="Pear P2P Network" desc="Decentralized peer discovery and communication (config: p2p.pear.discovery: true)" verified={true} />
              <ArchItem icon={Clock} color="orange" title="Time Scheduler" desc="Automatic day/night mode switching (config: scheduler.enabled: true, nightStart: 20, nightEnd: 6)" verified={true} />
              <ArchItem icon={Activity} color="purple" title="Task Monitor" desc="Real-time inference task detection and miner notification (TaskMonitor class)" verified={true} />
              <ArchItem icon={Cpu} color="indigo" title="Parallel Miners (4)" desc="Cortensor, Chutes, Fortytwo, Earnidle in parallel monitoring mode (config: miners.parallelMode: true)" verified={true} />
            </div>
          </div>

          {/* FAQ */}
          <div className="card">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-400" />
              FAQ
            </h3>
            <div className="space-y-4">
              <FAQItem question="What happens when my app needs AI?" answer="The inference system automatically pauses earning and frees up resources for your app. When your app is done, earning resumes automatically. This is handled by the TaskMonitor which detects active inference requests." />
              <FAQItem question="How much can users earn?" answer="Earnings depend on the user's hardware, available compute time, and current demand for inference tasks across the four miner networks. Users can track earnings in real-time via the dashboard." />
              <FAQItem question="Do I need to specify AI models in my app?" answer="No. Regular apps don't specify models — the embed uses optimal local models automatically. Only dedicated mining nodes with specific hardware (e.g., Cortensor validators, Fortytwo workers) require explicit model configuration." />
              <FAQItem question="Is inference data sent to external servers?" answer="Inference runs locally on the user's device. Only the inference results (task outputs) are transmitted to tasker networks (Cortensor, Fortytwo, Chutes, Earnidle) for validation and reward distribution. No raw user data or prompts leave the device." />
              <FAQItem question="What if the user declines?" answer="Your app continues to work normally. The user just won't earn from compute contribution. They can always opt in later through your app's settings or the dashboard." />
              <FAQItem question="Does this work on iOS?" answer="Currently Android only. QVAC native modules require Android with compatible chipsets. iOS support is planned for future releases." />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-dark-700 bg-dark-800/50 mt-16">
          <div className="container mx-auto px-6 py-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Star className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm text-dark-400">Stellar Field Integration Example</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-dark-400 flex-wrap">
                <a href="https://github.com/Rezimod/Stellar" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
                <span>•</span>
                <a href="https://stellarrclub.vercel.app" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Live Demo</a>
                <span>•</span>
                <a href="https://qvac.tether.io/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">QVAC Docs</a>
                <span>•</span>
                <span>Embed & Earn Integration</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}