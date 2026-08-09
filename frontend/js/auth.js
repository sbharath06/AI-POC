class AuthManager {
    constructor() {
        this.tokenKey = 'probot_jwt_token';
        this.setupBaseUrl();
    }

    setupBaseUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.baseUrl = 'http://localhost:8000';
        } else if (window.PROBOT_BACKEND_URL) {
            this.baseUrl = window.PROBOT_BACKEND_URL;
        } else if (window.location.hostname.includes('netlify.app') || window.location.hostname.includes('github.io')) {
            // Netlify serves static frontend — route API requests to local backend by default
            this.baseUrl = 'http://localhost:8000';
        } else {
            this.baseUrl = window.location.origin;
        }
    }

    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    setToken(token) {
        localStorage.setItem(this.tokenKey, token);
    }

    clearToken() {
        localStorage.removeItem(this.tokenKey);
    }

    isAuthenticated() {
        const token = this.getToken();
        if (!token) return false;

        try {
            const payload = this.decodeToken();
            const exp = payload.exp * 1000;
            if (Date.now() >= exp) {
                this.clearToken();
                return false;
            }
            return true;
        } catch (e) {
            this.clearToken();
            return false;
        }
    }

    decodeToken() {
        const token = this.getToken();
        if (!token) return null;
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    async login(username, password) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            body: formData // Assuming OAuth2 password flow which uses form data
        });

        if (!response.ok) {
            let errorMsg = 'Login failed';
            try {
                const error = await response.json();
                errorMsg = error.detail || errorMsg;
            } catch (e) {
                errorMsg = `Server error (${response.status}). Ensure backend is running.`;
            }
            throw new Error(errorMsg);
        }

        try {
            const data = await response.json();
            this.setToken(data.access_token);
            return data;
        } catch (e) {
            throw new Error(`Unable to connect to backend server at ${this.baseUrl}`);
        }
    }

    async register(username, email, password) {
        const response = await fetch(`${this.baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            let errorMsg = 'Registration failed';
            try {
                const error = await response.json();
                errorMsg = error.detail || errorMsg;
            } catch (e) {
                errorMsg = `Server error (${response.status}). Please try logging in or registering again.`;
            }
            throw new Error(errorMsg);
        }

        try {
            return await response.json();
        } catch (e) {
            return { message: 'Registration successful' };
        }
    }

    async forgotPassword(email) {
        const response = await fetch(`${this.baseUrl}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Failed to generate reset code' }));
            throw new Error(error.detail || 'Failed to generate reset code');
        }
        return await response.json();
    }

    async resetPassword(email, reset_code, new_password) {
        const response = await fetch(`${this.baseUrl}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, reset_code, new_password })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Failed to reset password' }));
            throw new Error(error.detail || 'Failed to reset password');
        }
        return await response.json();
    }

    async wipeDatabase() {
        const response = await fetch(`${this.baseUrl}/api/auth/wipe-database`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Failed to wipe database');
        }
        return await response.json();
    }

    logout() {
        this.clearToken();
    }
}
