// Simplified useAuth hook for vanilla JS
// Provides easy access to authentication state and methods

import { createAuthProvider } from './wdk-auth.js';

// Create singleton auth provider
const authProvider = createAuthProvider({
  wdkAppId: 'earnidle-app',
  supportedChains: ['ethereum', 'ton', 'solana'],
});

// Subscriber pattern for state management
const subscribers = new Set();
let currentState = authProvider.getState();

authProvider.subscribe((newState) => {
  currentState = newState;
  subscribers.forEach(cb => cb(newState));
});

export function useAuth() {
  // Return current state with reactive getters
  return {
    // State
    get user() { return currentState.user; },
    get wallet() { return currentState.wallet; },
    get isAuthenticated() { return currentState.isAuthenticated; },
    get isLoading() { return currentState.isLoading; },
    get authMethod() { return currentState.authMethod; },
    
    // Methods
    login: {
      oauth: (provider) => authProvider.signInWithOAuth(provider),
      email: (email, password) => authProvider.signInWithEmail(email, password),
      passkey: () => authProvider.signInWithPasskey(),
    },
    logout: () => authProvider.signOut(),
    
    // Subscribe to changes
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    
    // Wallet utilities
    hasWalletForChain: (chain) => authProvider.hasWalletForChain(chain),
    switchChain: (chain) => authProvider.switchChain(chain),
  };
}

export function getAuthProvider() {
  return authProvider;
}

export default {
  useAuth,
  getAuthProvider,
};