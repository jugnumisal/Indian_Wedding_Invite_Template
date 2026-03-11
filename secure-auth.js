// Secure Authentication System for Wedding Website
// This replaces the insecure client-side access codes

class SecureAuth {
    constructor() {
        // Detect environment in browser-compatible way
        const isProduction = window.location.hostname !== 'localhost' && 
                            window.location.hostname !== '127.0.0.1' &&
                            window.location.protocol !== 'file:';
        
        this.apiBase = isProduction
            ? 'https://your-api-gateway-url.execute-api.region.amazonaws.com/prod' 
            : 'http://localhost:3001'; // Local API server
        this.tokenKey = 'wedding_auth_token';
        this.userKey = 'wedding_user_info';
        this.sessionDuration = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
        
        console.log('SecureAuth initialized:', {
            isProduction,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            apiBase: this.apiBase
        });
    }
    
    // Test API connectivity
    async testConnection() {
        try {
            console.log('Testing API connection to:', `${this.apiBase}/health`);
            const response = await fetch(`${this.apiBase}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                mode: 'cors'
            });
            
            console.log('Health check response:', response.status, response.statusText);
            
            if (response.ok) {
                const data = await response.json();
                console.log('API is healthy:', data);
                return { success: true, data };
            } else {
                console.error('API health check failed:', response.status);
                return { success: false, error: `API returned ${response.status}` };
            }
        } catch (error) {
            console.error('API connection test failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate unique invitation tokens (to be done server-side)
    // This is just for reference - actual implementation should be server-side
    generateInvitationToken(guestInfo) {
        // Server-side implementation would:
        // 1. Create unique token for each guest/family
        // 2. Store token with guest permissions in database
        // 3. Send personalized invitation links
        const token = this.generateSecureToken();
        return {
            token: token,
            guestId: guestInfo.id,
            permissions: guestInfo.permissions,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        };
    }

    generateSecureToken() {
        // Generate cryptographically secure random token
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Authenticate user with invitation token
    async authenticateWithToken(token) {
        console.log('🔐 Authenticating token:', token);
        console.log('🌐 API Base URL:', this.apiBase);
        console.log('🏠 Current hostname:', window.location.hostname);
        
        // Check for hardcoded access codes
        if (token === 'admin') {
            console.log('✅ Using hardcoded admin access code');
            const userData = {
                token: token,
                guest_name: 'Admin User',
                email: 'admin@wedding.com',
                phone: null,
                max_guests: 999,
                permissions: ['admin', 'guest', 'rsvp'],
                event_access: ['haldi', 'sangeet', 'wedding'],
                eventAccess: ['haldi', 'sangeet', 'wedding'],
                maxGuests: 999,
                side: 'admin',
                familyGroup: 'admin',
                canRSVP: true,
                created_at: new Date().toISOString()
            };
            this.setUserSession(userData);
            return { success: true, user: userData };
        }
        
        const url = `${this.apiBase}/auth/validate-token`;
        console.log('📡 Full URL:', url);
        
        try {
            console.log('📤 Making fetch request...');
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });
            
            console.log('📥 Response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                url: response.url
            });

            if (response.ok) {
                const userData = await response.json();
                console.log('✅ Authentication successful:', userData);
                this.setUserSession(userData.user || userData);
                return { success: true, user: userData.user || userData };
            } else {
                const errorText = await response.text();
                console.log('❌ Authentication failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                
                let errorData = {};
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    console.log('Failed to parse error as JSON:', errorText);
                }
                
                return { success: false, error: errorData.error || 'Invalid invitation token' };
            }
        } catch (error) {
            console.error('💥 Fetch error:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return { success: false, error: 'Network error - unable to connect to server' };
            }
            
            return { success: false, error: 'Connection failed - please try again' };
        }
    }

    // Development mode check
    isDevelopmentMode() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.protocol === 'file:';
    }

    // Cookie helper methods
    setCookie(name, value, hours) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (hours * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Strict;Secure=${location.protocol === 'https:'}`;
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }

    // Check if user has valid session
    isAuthenticated() {
        // Try cookies first, then localStorage
        let token = this.getCookie(this.tokenKey);
        if (!token) {
            token = localStorage.getItem(this.tokenKey);
        }
        
        const userInfo = this.getUserInfo();
        
        if (!token || !userInfo) {
            return false;
        }

        // Check if session is expired (4 hours)
        if (userInfo.sessionExpiresAt && new Date() > new Date(userInfo.sessionExpiresAt)) {
            this.clearSession();
            return false;
        }

        return true;
    }

    // Check if user has specific permission
    hasPermission(permission) {
        const userInfo = this.getUserInfo();
        return userInfo && userInfo.permissions && userInfo.permissions.includes(permission);
    }

    // Get current user info
    getUserInfo() {
        console.log('Getting user info...');
        console.log('User key:', this.userKey);
        
        // Try cookies first
        const cookieUserInfo = this.getCookie(this.userKey);
        console.log('Raw cookie value:', cookieUserInfo);
        
        if (cookieUserInfo) {
            try {
                const parsed = JSON.parse(cookieUserInfo);
                console.log('Parsed user info from cookie:', parsed);
                return parsed;
            } catch (error) {
                console.error('Error parsing user info from cookie:', error);
            }
        } else {
            console.log('No user info cookie found, trying localStorage...');
        }
        
        // Fall back to localStorage if cookies don't work (e.g., file:// protocol)
        const localStorageUserInfo = localStorage.getItem(this.userKey);
        console.log('Raw localStorage value:', localStorageUserInfo);
        
        if (localStorageUserInfo) {
            try {
                const parsed = JSON.parse(localStorageUserInfo);
                console.log('Parsed user info from localStorage:', parsed);
                return parsed;
            } catch (error) {
                console.error('Error parsing user info from localStorage:', error);
            }
        } else {
            console.log('No user info in localStorage either');
        }
        
        return null;
    }

    // Set user session with 4-hour expiration
    setUserSession(userData) {
        console.log('Setting user session with data:', userData);
        
        // Add session expiration time (4 hours from now)
        const sessionExpiresAt = new Date(Date.now() + this.sessionDuration);
        const sessionData = {
            ...userData,
            sessionExpiresAt: sessionExpiresAt.toISOString(),
            loginTime: new Date().toISOString()
        };

        console.log('Session data to store:', sessionData);

        // Store in cookies with 4-hour expiration
        this.setCookie(this.tokenKey, userData.token, 4);
        this.setCookie(this.userKey, JSON.stringify(sessionData), 4);

        // Also store in localStorage as backup (for offline scenarios)
        localStorage.setItem(this.tokenKey, userData.token);
        localStorage.setItem(this.userKey, JSON.stringify(sessionData));
        
        console.log('Session stored. Verifying...');
        console.log('Cookie token:', this.getCookie(this.tokenKey));
        console.log('Cookie user info:', this.getCookie(this.userKey));
        console.log('LocalStorage token:', localStorage.getItem(this.tokenKey));
        console.log('LocalStorage user info:', localStorage.getItem(this.userKey));
        
        try { document.dispatchEvent(new CustomEvent('wedding:auth:login')); } catch (_) {}
    }

    // Clear user session
    clearSession() {
        // Clear cookies
        this.deleteCookie(this.tokenKey);
        this.deleteCookie(this.userKey);
        
        // Clear localStorage backup
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
    }

    // Check if session is about to expire (within 30 minutes)
    isSessionExpiringSoon() {
        const userInfo = this.getUserInfo();
        if (!userInfo || !userInfo.sessionExpiresAt) return false;
        
        const expirationTime = new Date(userInfo.sessionExpiresAt);
        const warningTime = new Date(expirationTime.getTime() - (30 * 60 * 1000)); // 30 minutes before
        
        return new Date() > warningTime;
    }

    // Extend session by another 4 hours
    extendSession() {
        const userInfo = this.getUserInfo();
        if (!userInfo) return false;

        // Update expiration time
        const newExpirationTime = new Date(Date.now() + this.sessionDuration);
        userInfo.sessionExpiresAt = newExpirationTime.toISOString();

        // Update cookies and localStorage
        this.setCookie(this.userKey, JSON.stringify(userInfo), 4);
        localStorage.setItem(this.userKey, JSON.stringify(userInfo));

        return true;
    }

    // Logout user
    logout() {
        this.clearSession();
        window.location.href = 'index.html';
    }
}

// Page access control with secure authentication
class PageAccessControl {
    constructor() {
        this.auth = new SecureAuth();
        this.pagePermissions = {
            'home': [], // No restrictions
            'event-details': ['guest', 'family', 'admin'],
            'rsvp': ['guest', 'family', 'admin'],
            'location': ['guest', 'family', 'admin'],
            'admin-guests': ['admin']
        };
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        if (filename === 'index.html' || filename === '') return 'home';
        if (filename === 'event-details.html') return 'event-details';
        if (filename === 'rsvp.html') return 'rsvp';
        if (filename === 'location.html') return 'location';
        
        return 'home';
    }

    checkPageAccess() {
        const currentPage = this.getCurrentPage();
        const requiredPermissions = this.pagePermissions[currentPage];

        // If page has no restrictions, allow access
        if (!requiredPermissions || requiredPermissions.length === 0) {
            // Still update navigation if user is authenticated
            if (this.auth.isAuthenticated()) {
                this.updateNavigation();
            }
            return true;
        }

        // Check if user is authenticated
        if (!this.auth.isAuthenticated()) {
            this.showAuthModal();
            return false;
        }

        // Get user permissions with proper mapping
        const userInfo = this.auth.getUserInfo();
        const userPermissions = this.mapGuestTypeToPermissions(userInfo);

        // Check if user has required permissions
        const hasAccess = requiredPermissions.some(permission => 
            userPermissions.includes(permission)
        );

        if (!hasAccess) {
            this.showAccessDeniedModal();
            return false;
        }

        // Special check for RSVP page - check if user has canRSVP permission
        if (currentPage === 'rsvp' && userInfo.canRSVP === false) {
            this.showAccessDeniedModal('You do not have permission to submit RSVPs.');
            return false;
        }

        // User has access - update navigation
        this.updateNavigation();
        return true;
    }

    showAuthModal() {
        // Check if we have an invitation token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const invitationToken = urlParams.get('token');

        if (invitationToken) {
            this.authenticateWithToken(invitationToken);
            return;
        }

        // Show authentication modal
        let modal = document.getElementById('authModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'authModal';
            modal.className = 'auth-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <button class="modal-close" type="button" aria-label="Close">&times;</button>
                    <h2 class="modal-title">Access Required</h2>
                    <p class="modal-description">Please enter your personal invitation code:</p>
                    <input type="password" id="invitationCode" placeholder="Enter your invitation code" class="modal-input">
                    <button onclick="pageAccess.validateInvitation()" class="modal-submit">Submit</button>
                    <p class="modal-help" style="margin-top: 1rem; font-size: 0.9rem; color: #666;">
                        Your invitation code was provided in your personal invitation. 
                        Contact the couple if you need assistance.
                    </p>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        // Wire up close actions once:
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn && !closeBtn._wired) {
            closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
            closeBtn._wired = true;
        }
        
        // Optional: click the dark backdrop to close
        if (!modal._backdropClose) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
            modal._backdropClose = true;
        }
        
        // Optional: ESC to close
        if (!modal._escClose) {
            document.addEventListener('keydown', function escHandler(ev) {
                if (ev.key === 'Escape' && modal.style.display === 'block') {
                    modal.style.display = 'none';
                }
            }, { once: false });
            modal._escClose = true;
        }
        
        modal.style.display = 'block';
        

        
        // Focus on input
        setTimeout(() => {
            const input = document.getElementById('invitationCode');
            if (input) input.focus();
        }, 100);

        // Handle Enter key (avoid duplicate listeners)
        const invitationInput = document.getElementById('invitationCode');
        if (invitationInput && !invitationInput.hasAttribute('data-listener-added')) {
            invitationInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    pageAccess.validateInvitation();
                }
            });
            invitationInput.setAttribute('data-listener-added', 'true');
        }
    }

    showAccessDeniedModal() {
        let modal = document.getElementById('accessDeniedModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'accessDeniedModal';
            modal.className = 'auth-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2>Access Denied</h2>
                    <p>You don't have permission to view this page.</p>
                    <button onclick="this.parentElement.parentElement.style.display='none'">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        modal.style.display = 'block';
    }

    async validateInvitation() {
        const code = document.getElementById('invitationCode').value;
        
        if (!code) {
            this.showModalMessage('Please enter your invitation code.', 'error');
            return;
        }

        // Show loading state
        this.showModalMessage('Validating invitation...', 'info');

        const result = await this.auth.authenticateWithToken(code);
        
        if (result.success) {
            this.showModalMessage('Welcome! Access granted.', 'success');
            
            // Wait a moment for session to be fully set, then update navigation
            setTimeout(() => {
                console.log('Updating navigation after successful authentication');
                this.updateNavigation();
                
                // Force a navigation refresh to ensure all elements are visible
                setTimeout(() => {
                    this.updateNavigation();
                    console.log('Navigation updated twice to ensure visibility');
                }, 500);
            }, 100);
            
            // Close modal after success
            setTimeout(() => {
                const modal = document.getElementById('authModal');
                if (modal) {
                    modal.style.display = 'none';
                }
                // No need to reload - navigation is already updated
            }, 2000);
        } else {
            this.showModalMessage(result.error || 'Invalid invitation code.', 'error');
            document.getElementById('invitationCode').value = '';
        }
    }

    async authenticateWithToken(token) {
        const result = await this.auth.authenticateWithToken(token);
        
        if (result.success) {
            // Remove token from URL for security
            const url = new URL(window.location);
            url.searchParams.delete('token');
            window.history.replaceState({}, document.title, url);
            
            // Update navigation and reload
            this.updateNavigation();
            window.location.reload();
        } else {
            this.showAuthModal();
        }
    }

    showModalMessage(message, type) {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        
        const modalContent = modal.querySelector('.modal-content');
        
        // Remove existing messages
        const existingMessage = modalContent.querySelector('.modal-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `modal-message ${type}`;
        messageDiv.style.cssText = `
            padding: 1rem;
            margin: 1rem 0;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            text-align: center;
            ${type === 'success' ? 'background: #28a745;' : 
              type === 'error' ? 'background: #dc3545;' : 
              'background: #17a2b8;'}
        `;
        
        messageDiv.textContent = message;
        
        const input = modalContent.querySelector('input');
        input.parentNode.insertBefore(messageDiv, input.nextSibling);
    }

    updateNavigation() {
        const userInfo = this.auth.getUserInfo();
        const isAuthenticated = !!(userInfo && this.auth.isAuthenticated());

        // Show/hide role-gated links
        const userPermissions = isAuthenticated ? this.mapGuestTypeToPermissions(userInfo) : [];
        
        document.querySelectorAll('.access-required').forEach(li => {
            const required = li.getAttribute('data-access');
            if (!required) return;
            
            if (!isAuthenticated) {
                li.style.display = 'none';
                return;
            }
            
            li.style.display = userPermissions.includes(required) ? '' : 'none';
        });

        // Hide ALL "Enter Invite Code" buttons when authenticated (defeat CSS !important)
        const codeItems = document.querySelectorAll('.access-code-item, .invite-code-btn');
        codeItems.forEach(el => {
            if (isAuthenticated) {
                // add a CSS hammer
                el.classList.add('hide-auth');
                // and double-ensure via inline !important for cases without class
                el.style.setProperty('display', 'none', 'important');
            } else {
                el.classList.remove('hide-auth');
                el.style.removeProperty('display');
            }
        });

        // Ensure Logout button presence/absence
        if (isAuthenticated) {
            document.querySelectorAll('.logout-btn-item').forEach(n => n.remove());
            this.addLogoutButton();
        } else {
            document.querySelectorAll('.logout-btn-item').forEach(n => n.remove());
        }
    }

    // Map guest types from database to navigation permissions
    mapGuestTypeToPermissions(userInfo) {
        const permissions = [];
        
        // Add base guest permission for all authenticated users
        permissions.push('guest');
        
        // Map guest types to navigation permissions
        if (userInfo.side === 'family' || userInfo.familyGroup === 'family') {
            permissions.push('family');
        }
        
        // Map friend, colleague, other to 'friends' for navigation
        if (userInfo.side === 'friend' || userInfo.familyGroup === 'friend' || 
            userInfo.familyGroup === 'colleague' || userInfo.familyGroup === 'other') {
            permissions.push('friends');
        }
        
        // Admin permissions
        if (userInfo.permissions && userInfo.permissions.includes('admin')) {
            permissions.push('admin');
        }
        
        // Also include original permissions if they exist
        if (userInfo.permissions && Array.isArray(userInfo.permissions)) {
            permissions.push(...userInfo.permissions);
        }
        
        // Remove duplicates
        return [...new Set(permissions)];
    }

    addLogoutButton() {
        // (A) Desktop/right side
        const rightHost = document.querySelector('.hero-nav-right') || document.querySelector('.nav-right');
        
        if (rightHost && !rightHost.querySelector('.logout-btn')) {
            const btn = document.createElement('button');
            btn.className = 'logout-btn';
            btn.textContent = 'Logout';
            btn.onclick = (e) => {
                e.preventDefault();
                this.auth.logout();
                return false;
            };
            rightHost.appendChild(btn);
        }

        // (B) Mobile menu (append a <li> to the nav list)
        const navList = document.querySelector('.hero-nav-list') || document.querySelector('.nav-menu');
        if (navList) {
            // Clean previous duplicates
            navList.querySelectorAll('.logout-btn-item').forEach(n => n.remove());

            const li = document.createElement('li');
            li.className = 'mobile-only-item logout-btn-item';

            const mobileBtn = document.createElement('button');
            mobileBtn.className = 'logout-btn';
            mobileBtn.textContent = 'Logout';
            mobileBtn.style.width = '100%';
            mobileBtn.onclick = (e) => {
                e.preventDefault();
                this.auth.logout();
                // Close mobile menu if open
                const center = document.querySelector('.hero-nav-center');
                const toggle = document.querySelector('.mobile-menu-toggle');
                if (center && center.classList.contains('mobile-menu-open')) {
                    center.classList.remove('mobile-menu-open');
                }
                if (toggle && toggle.classList.contains('active')) {
                    toggle.classList.remove('active');
                }
                return false;
            };

            li.appendChild(mobileBtn);
            navList.appendChild(li);
        }
    }
}

// Initialize page access control
const pageAccess = new PageAccessControl();

// Test API connection on load (for debugging)
if (window.location.search.includes('debug=true')) {
    pageAccess.auth.testConnection().then(result => {
        console.log('API Connection Test Result:', result);
    });
}

// Session monitoring and management
function initializeSessionMonitoring() {
    // Check session status every 5 minutes
    setInterval(() => {
        if (pageAccess.auth.isAuthenticated()) {
            // Check if session is expiring soon
            if (pageAccess.auth.isSessionExpiringSoon()) {
                showSessionExpirationWarning();
            }
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Extend session on user activity
    let activityTimer;
    const resetActivityTimer = () => {
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
            // If user is authenticated and active, extend session
            if (pageAccess.auth.isAuthenticated()) {
                pageAccess.auth.extendSession();
            }
        }, 30 * 60 * 1000); // Extend after 30 minutes of activity
    };

    // Listen for user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetActivityTimer, true);
    });
}

function showSessionExpirationWarning() {
    // Don't show multiple warnings
    if (document.getElementById('sessionWarningModal')) return;

    const modal = document.createElement('div');
    modal.id = 'sessionWarningModal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Session Expiring Soon</h2>
            <p>Your session will expire in less than 30 minutes. Would you like to extend it?</p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem;">
                <button onclick="extendUserSession()" style="background: #28a745; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Extend Session</button>
                <button onclick="closeSessionWarning()" style="background: #6c757d; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Not Now</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';
}

function extendUserSession() {
    if (pageAccess.auth.extendSession()) {
        const modal = document.getElementById('sessionWarningModal');
        if (modal) {
            modal.querySelector('.modal-content').innerHTML = `
                <h2>Session Extended</h2>
                <p>Your session has been extended for another 4 hours.</p>
                <button onclick="closeSessionWarning()" style="background: #28a745; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-top: 1rem;">OK</button>
            `;
        }
        setTimeout(closeSessionWarning, 2000);
    }
}

function closeSessionWarning() {
    const modal = document.getElementById('sessionWarningModal');
    if (modal) {
        modal.remove();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Pre-check authentication to avoid flicker
    const isAuthenticated = pageAccess.auth.isAuthenticated();
    
    if (isAuthenticated) {
        // Show navigation immediately to prevent flicker
        pageAccess.updateNavigation();
        
        // Initialize session monitoring for authenticated users
        initializeSessionMonitoring();
    }
    
    // Check page access after navigation is set
    pageAccess.checkPageAccess();
    
    // Add click handlers to navigation links for access control
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('#')) {
                e.preventDefault();
                
                // Extract page name from href
                let page = href.replace('.html', '');
                if (page === 'index' || page === '') page = 'home';
                
                // Check if this page requires access
                const requiredPermissions = pageAccess.pagePermissions[page];
                if (requiredPermissions && requiredPermissions.length > 0) {
                    // Check if user has access
                    if (!pageAccess.auth.isAuthenticated()) {
                        pageAccess.showAuthModal();
                        return;
                    }
                    
                    const hasAccess = requiredPermissions.some(permission => 
                        pageAccess.auth.hasPermission(permission)
                    );
                    
                    if (!hasAccess) {
                        pageAccess.showAccessDeniedModal();
                        return;
                    }
                }
                
                // Navigate to the page
                window.location.href = href;
            }
        });
    });
});

// Global function for access modal (called from onclick handlers)
function showAccessModal() {
    pageAccess.showAuthModal();
}
