// State management
const state = {
    consentGiven: false,
    signedIn: false,
    signInMethod: null
};

// DOM elements
const consentSection = document.getElementById('consent-section');
const signinSection = document.getElementById('signin-section');
const downloadSection = document.getElementById('download-section');
const consentCheckbox = document.getElementById('consent-checkbox');
const consentBtn = document.getElementById('consent-btn');
const signinOptions = document.querySelectorAll('.btn-option');
const emailForm = document.getElementById('email-form');
const walletForm = document.getElementById('wallet-form');
const emailInput = document.getElementById('email-input');
const emailSigninBtn = document.getElementById('email-signin-btn');
const walletConnectBtn = document.getElementById('wallet-connect-btn');
const downloadBtn = document.getElementById('download-btn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

// Utility functions
function showLoading(text) {
    loadingText.textContent = text;
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function showSection(section) {
    consentSection.classList.add('hidden');
    signinSection.classList.add('hidden');
    downloadSection.classList.add('hidden');
    section.classList.remove('hidden');
}

async function apiCall(endpoint, data) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        return { success: false, error: error.message };
    }
}

// Consent handling
consentCheckbox.addEventListener('change', () => {
    consentBtn.disabled = !consentCheckbox.checked;
});

consentBtn.addEventListener('click', async () => {
    showLoading('Processing consent...');
    
    const result = await apiCall('/api/consent', {
        accepted: true
    });
    
    hideLoading();
    
    if (result.success) {
        state.consentGiven = true;
        showSection(signinSection);
    } else {
        alert('Failed to process consent. Please try again.');
    }
});

// Sign-in handling
signinOptions.forEach(btn => {
    btn.addEventListener('click', () => {
        const method = btn.dataset.method;
        state.signInMethod = method;
        
        emailForm.classList.add('hidden');
        walletForm.classList.add('hidden');
        
        if (method === 'email') {
            emailForm.classList.remove('hidden');
        } else if (method === 'wallet') {
            walletForm.classList.remove('hidden');
        }
    });
});

emailSigninBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }
    
    showLoading('Signing in...');
    
    const result = await apiCall('/api/signin', {
        method: 'email',
        email: email
    });
    
    hideLoading();
    
    if (result.success) {
        state.signedIn = true;
        showSection(downloadSection);
    } else {
        alert('Sign-in failed. Please try again.');
    }
});

walletConnectBtn.addEventListener('click', async () => {
    showLoading('Connecting wallet...');
    
    // Simulate wallet connection
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = await apiCall('/api/signin', {
        method: 'wallet'
    });
    
    hideLoading();
    
    if (result.success) {
        state.signedIn = true;
        showSection(downloadSection);
    } else {
        alert('Wallet connection failed. Please try again.');
    }
});

// Download handling
downloadBtn.addEventListener('click', async () => {
    showLoading('Preparing download...');
    
    try {
        const response = await fetch('/api/download');
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            // In real implementation, this would trigger actual download
            alert('Download ready! In production, the installer would download automatically.');
            console.log('Download URL:', result.downloadUrl);
        } else {
            alert('Download failed: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        alert('Download failed: ' + error.message);
    }
});

// Initialize
console.log('QVAC-Pear Miner Node download page loaded');
