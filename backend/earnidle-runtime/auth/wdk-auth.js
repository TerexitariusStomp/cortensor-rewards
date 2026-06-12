// WDK Authentication System for EarnIdle
// Provides WDK-style authentication and wallet management

import { EventEmitter } from 'events';

class WDKAuthProvider extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      wdkAppId: config.wdkAppId || 'earnidle-app',
      supportedChains: config.supportedChains || ['ethereum', 'ton', 'solana'],
      ...config
    };
    
    this.state = {
      user: null,
      wallet: null,
      isAuthenticated: false,
      isLoading: false,
      authMethod: null,
    };
    
    this.wdkWallet = null;
    this.listeners = new Set();
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
    this.emit('change', this.state);
  }

  // OAuth login (Google, Apple, etc.)
  async signInWithOAuth(provider = 'google') {
    this.setState({ isLoading: true });
    
    try {
      // In a real implementation, this would use WDK's OAuth flow
      // For now, simulate the flow
      const user = {
        id: `user_${Date.now()}`,
        email: `user@example.com`,
        name: 'Demo User',
        provider,
        avatar: null,
      };
      
      await this.initializeWallet(user);
      
      this.setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        authMethod: `oauth-${provider}`,
      });
      
      this.emit('signedIn', { user, wallet: this.state.wallet });
      return { user, wallet: this.state.wallet };
    } catch (error) {
      this.setState({ isLoading: false });
      throw error;
    }
  }

  // Email/password login
  async signInWithEmail(email, password) {
    this.setState({ isLoading: true });
    
    try {
      // Simulate email auth
      const user = {
        id: `user_${Date.now()}`,
        email,
        name: email.split('@')[0],
        provider: 'email',
        avatar: null,
      };
      
      await this.initializeWallet(user);
      
      this.setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        authMethod: 'email',
      });
      
      this.emit('signedIn', { user, wallet: this.state.wallet });
      return { user, wallet: this.state.wallet };
    } catch (error) {
      this.setState({ isLoading: false });
      throw error;
    }
  }

  // Passkey/WebAuthn login
  async signInWithPasskey() {
    this.setState({ isLoading: true });
    
    try {
      // Check for WebAuthn support
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('Passkeys not supported in this environment');
      }
      
      // Simulate passkey flow
      const user = {
        id: `user_${Date.now()}`,
        email: 'passkey-user@example.com',
        name: 'Passkey User',
        provider: 'passkey',
        avatar: null,
      };
      
      await this.initializeWallet(user);
      
      this.setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        authMethod: 'passkey',
      });
      
      this.emit('signedIn', { user, wallet: this.state.wallet });
      return { user, wallet: this.state.wallet };
    } catch (error) {
      this.setState({ isLoading: false });
      throw error;
    }
  }

  // Initialize WDK wallet for user
  async initializeWallet(user) {
    try {
      // In production, this would use @tetherto/wdk to create/derive wallets
      // For now, generate a deterministic wallet address from user ID
      const seed = await this.generateSeedFromUserId(user.id);
      const wallet = await this.deriveWallet(seed);
      
      this.wdkWallet = wallet;
      this.setState({ wallet });
      
      return wallet;
    } catch (error) {
      console.error('Failed to initialize wallet:', error);
      // Fallback to a simple address
      const fallbackWallet = {
        address: `0x${user.id.slice(-40).padStart(40, '0')}`,
        chain: 'ethereum',
        type: 'embedded',
      };
      this.wdkWallet = fallbackWallet;
      this.setState({ wallet: fallbackWallet });
      return fallbackWallet;
    }
  }

  // Generate deterministic seed from user ID
  async generateSeedFromUserId(userId) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`earnidle-wdk-${userId}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }

  // Derive wallet from seed (simplified - in production uses @tetherto/wdk)
  async deriveWallet(seed) {
    // Convert seed to hex for address generation
    const seedHex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
    const address = `0x${seedHex.slice(0, 40)}`;
    
    return {
      address,
      chain: 'ethereum',
      type: 'wdk-embedded',
      // In production, this would include:
      // - signMessage(message)
      // - signTransaction(tx)
      // - getBalance()
      // - sendTransaction(tx)
      signMessage: async (message) => {
        // Mock signature
        return `0x${Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 130)}`;
      },
      signTransaction: async (tx) => {
        // Mock signed transaction
        return `0x${seedHex.slice(0, 130)}`;
      },
    };
  }

  // Sign out
  async signOut() {
    this.wdkWallet = null;
    this.setState({
      user: null,
      wallet: null,
      isAuthenticated: false,
      authMethod: null,
    });
    this.emit('signedOut');
  }

  // Get current state
  getState() {
    return { ...this.state };
  }

  // Check if user has wallet for specific chain
  hasWalletForChain(chain) {
    return this.state.wallet && 
           (this.state.wallet.chain === chain || this.state.wallet.chains?.includes(chain)) || false;
  }

  // Switch wallet chain
  async switchChain(chain) {
    if (!this.state.wallet) {
      throw new Error('No wallet connected');
    }
    
    // In production, use WDK to switch chains
    this.setState({
      wallet: { ...this.state.wallet, chain }
    });
  }
}

// Simplified auth hook for vanilla JS
export function createUseAuth(authProvider) {
  return function useAuth() {
    const [state, setState] = useState(authProvider.getState());
    
    // Subscribe to auth changes
    useEffect(() => {
      const unsubscribe = authProvider.subscribe(newState => {
        setState(newState);
      });
      return unsubscribe;
    }, []);
    
    return {
      ...state,
      login: {
        oauth: (provider) => authProvider.signInWithOAuth(provider),
        email: (email, password) => authProvider.signInWithEmail(email, password),
        passkey: () => authProvider.signInWithPasskey(),
      },
      logout: () => authProvider.signOut(),
    };
  };
}

// Simple useState/useEffect for vanilla JS
function useState(initialValue) {
  let value = initialValue;
  const listeners = new Set();
  
  const setValue = (newValue) => {
    value = typeof newValue === 'function' ? newValue(value) : newValue;
    listeners.forEach(l => l(value));
  };
  
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  
  return [value, setValue, subscribe];
}

function useEffect(effect, deps) {
  // Simplified - in real usage, this would be handled by a framework
  // For vanilla JS, we'll just run it once
  if (!useEffect.ran) {
    useEffect.ran = true;
    const cleanup = effect();
    return cleanup;
  }
}

// Singleton instance
let authProviderInstance = null;

export function getAuthProvider(config) {
  if (!authProviderInstance) {
    authProviderInstance = new WDKAuthProvider(config);
  }
  return authProviderInstance;
}

export function createAuthProvider(config) {
  return new WDKAuthProvider(config);
}

export { WDKAuthProvider };

export default {
  WDKAuthProvider,
  getAuthProvider,
  createAuthProvider,
  createUseAuth,
};