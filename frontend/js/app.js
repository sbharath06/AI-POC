class ProbotApp {
    constructor() {
        this.auth = new AuthManager();
        this.ws = new WebSocketManager(this.auth.baseUrl);
        this.toastContainer = document.getElementById('toast-container');
        
        this.init();
    }

    async init() {
        // Elements
        this.elements = {
            appContainer: document.getElementById('app-container'),
            authOverlay: document.getElementById('auth-overlay'),
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            usernameDisplay: document.getElementById('username-display'),
            sidebarToggle: document.getElementById('sidebar-toggle'),
            sidebar: document.getElementById('sidebar'),
            newChatBtn: document.getElementById('new-chat-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            docsToggle: document.getElementById('docs-toggle'),
            docList: document.getElementById('document-list'),
            voiceBtn: document.getElementById('voice-btn'),
            uploadBtn: document.getElementById('upload-btn')
        };

        this.setupAuthUI();
        
        if (this.auth.isAuthenticated()) {
            await this.initializeApp();
        } else {
            this.showAuthScreen();
        }
    }

    async initializeApp() {
        this.hideAuthScreen();
        
        const payload = this.auth.decodeToken();
        if (payload && payload.sub) {
            this.elements.usernameDisplay.textContent = payload.sub;
        }

        // Initialize Controllers
        this.chatController = new ChatController(this.ws, this.auth, this);
        this.voiceController = new VoiceController();
        this.uploadController = new UploadController(this.auth, this);
        this.converterController = new ConverterController(this.auth, this);

        // Setup WebSocket Callbacks
        this.ws.callbacks.onMessage = (data) => {
            switch(data.type) {
                case 'chat_token':
                    this.chatController.handleStreamToken(data.content);
                    break;
                case 'chat_complete':
                    this.chatController.handleStreamComplete(data);
                    break;
                case 'error':
                    this.chatController.handleError(data.content);
                    break;
                case 'tool_use':
                    this.showToast(data.content || 'Using tools...', 'info');
                    break;
                case 'rag_context':
                    // Could show a subtle indicator that documents are being referenced
                    break;
            }
        };

        this.ws.connect(this.auth.getToken());
        
        // Initial Data Load
        await this.chatController.loadSessions();
        await this.uploadController.loadDocuments();
        
        this.setupGlobalListeners();
    }

    setupGlobalListeners() {
        // Sidebar Toggle
        this.elements.sidebarToggle.addEventListener('click', () => {
            this.elements.sidebar.classList.toggle('collapsed');
        });

        // Mobile swipe
        let touchstartX = 0;
        document.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
        });
        document.addEventListener('touchend', e => {
            let touchendX = e.changedTouches[0].screenX;
            if (window.innerWidth <= 768) {
                if (touchendX > touchstartX + 50) { // Swipe right
                    this.elements.sidebar.classList.remove('collapsed');
                } else if (touchendX < touchstartX - 50) { // Swipe left
                    this.elements.sidebar.classList.add('collapsed');
                }
            }
        });

        // New Chat
        this.elements.newChatBtn.addEventListener('click', () => {
            this.chatController.createSession();
        });

        // Logout
        this.elements.logoutBtn.addEventListener('click', () => {
            this.auth.logout();
            this.ws.disconnect();
            this.showAuthScreen();
        });

        // Docs Toggle
        this.elements.docsToggle.addEventListener('click', () => {
            const icon = this.elements.docsToggle.querySelector('i');
            if (this.elements.docList.classList.contains('hidden')) {
                this.elements.docList.classList.remove('hidden');
                icon.className = 'fa-solid fa-chevron-down';
            } else {
                this.elements.docList.classList.add('hidden');
                icon.className = 'fa-solid fa-chevron-right';
            }
        });

        // Voice Input
        this.elements.voiceBtn.addEventListener('click', () => {
            if (this.voiceController.isListening) {
                this.voiceController.stopListening();
                this.elements.voiceBtn.classList.remove('recording');
            } else {
                this.voiceController.startListening((text) => {
                    document.getElementById('chat-input').value = text;
                    this.chatController.updateSendButtonState();
                    this.elements.voiceBtn.classList.remove('recording');
                });
                this.elements.voiceBtn.classList.add('recording');
            }
        });

        // Upload Modal
        this.elements.uploadBtn.addEventListener('click', () => {
            this.uploadController.showModal();
        });
        
        // Convert Modal
        document.getElementById('convert-nav-btn').addEventListener('click', () => {
            this.converterController.showModal();
        });
        
        // Settings
        this.setupSettings();
    }

    setupAuthUI() {
        // Tabs switching
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
                
                e.target.classList.add('active');
                document.getElementById(`${e.target.dataset.tab}-form`).classList.remove('hidden');
            });
        });

        // Login Submit
        this.elements.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const loader = btn.querySelector('.btn-loader');
            const txt = btn.querySelector('.btn-text');
            const errorDiv = document.getElementById('login-error');
            
            errorDiv.classList.add('hidden');
            txt.classList.add('hidden');
            loader.classList.remove('hidden');
            btn.disabled = true;

            try {
                const user = document.getElementById('login-username').value;
                const pass = document.getElementById('login-password').value;
                await this.auth.login(user, pass);
                await this.initializeApp();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            } finally {
                txt.classList.remove('hidden');
                loader.classList.add('hidden');
                btn.disabled = false;
            }
        });

        // Register Submit
        this.elements.registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const loader = btn.querySelector('.btn-loader');
            const txt = btn.querySelector('.btn-text');
            const errorDiv = document.getElementById('register-error');
            
            errorDiv.classList.add('hidden');
            txt.classList.add('hidden');
            loader.classList.remove('hidden');
            btn.disabled = true;

            try {
                const user = document.getElementById('register-username').value;
                const email = document.getElementById('register-email').value;
                const pass = document.getElementById('register-password').value;
                await this.auth.register(user, email, pass);
                await this.initializeApp();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            } finally {
                loader.classList.add('hidden');
                btn.disabled = false;
            }
        });

        // Toggle Password Eye Icons
        document.querySelectorAll('.toggle-password').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    if (input.type === 'password') {
                        input.type = 'text';
                        e.target.classList.remove('fa-eye');
                        e.target.classList.add('fa-eye-slash');
                    } else {
                        input.type = 'password';
                        e.target.classList.remove('fa-eye-slash');
                        e.target.classList.add('fa-eye');
                    }
                }
            });
        });

        // Forgot Password Link Click
        const forgotLink = document.getElementById('forgot-password-link');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
                document.getElementById('forgot-form').classList.remove('hidden');
            });
        }

        // Back to Login Link Click
        const backLink = document.getElementById('back-to-login-link');
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
                document.getElementById('login-form').classList.remove('hidden');
            });
        }

        // Forgot / Reset Form Submit
        let forgotStep = 1;
        const forgotForm = document.getElementById('forgot-form');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('forgot-btn');
                const loader = btn.querySelector('.btn-loader');
                const txt = btn.querySelector('.btn-text');
                const errorDiv = document.getElementById('forgot-error');
                const infoDiv = document.getElementById('forgot-info');
                
                errorDiv.classList.add('hidden');
                infoDiv.classList.add('hidden');
                txt.classList.add('hidden');
                loader.classList.remove('hidden');
                btn.disabled = true;

                try {
                    const email = document.getElementById('forgot-email').value;
                    if (forgotStep === 1) {
                        const res = await this.auth.forgotPassword(email);
                        infoDiv.textContent = `Reset Code: ${res.reset_code} (Code generated for ${email})`;
                        infoDiv.classList.remove('hidden');
                        document.getElementById('forgot-code-group').classList.remove('hidden');
                        document.getElementById('forgot-newpass-group').classList.remove('hidden');
                        txt.textContent = "Reset Password";
                        forgotStep = 2;
                    } else {
                        const code = document.getElementById('reset-code').value;
                        const newPass = document.getElementById('reset-new-password').value;
                        await this.auth.resetPassword(email, code, newPass);
                        this.showToast("Password reset successful! Please log in.", "success");
                        document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
                        document.getElementById('login-form').classList.remove('hidden');
                        forgotStep = 1;
                    }
                } catch (error) {
                    errorDiv.textContent = error.message;
                    errorDiv.classList.remove('hidden');
                } finally {
                    txt.classList.remove('hidden');
                    loader.classList.add('hidden');
                    btn.disabled = false;
                }
            });
        }

        // Wipe Database Button
        const wipeBtn = document.getElementById('wipe-db-btn');
        if (wipeBtn) {
            wipeBtn.addEventListener('click', async () => {
                if (confirm("Are you sure you want to erase all existing database user credentials and start clean?")) {
                    try {
                        const res = await this.auth.wipeDatabase();
                        this.showToast(res.message || "Database cleared cleanly!", "success");
                        alert("Database records erased! You can now create a fresh account.");
                    } catch (err) {
                        alert("Database wipe failed: " + err.message);
                    }
                }
            });
        }
    }

    showAuthScreen() {
        this.elements.authOverlay.classList.remove('hidden');
        this.elements.appContainer.classList.add('hidden');
    }

    hideAuthScreen() {
        this.elements.authOverlay.classList.add('hidden');
        this.elements.appContainer.classList.remove('hidden');
    }

    // API helper for authorized requests
    async apiRequest(endpoint, options = {}) {
        const token = this.auth.getToken();
        if (!token) {
            this.showAuthScreen();
            throw new Error('Not authenticated');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${this.auth.baseUrl}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            this.auth.logout();
            this.showAuthScreen();
            throw new Error('Session expired');
        }

        if (!response.ok) {
            let errorMsg = 'API request failed';
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorMsg;
            } catch(e) {}
            throw new Error(errorMsg);
        }
        
        // Some endpoints like DELETE might not return JSON
        if (response.status === 204) return null;
        
        return await response.json();
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'fa-circle-info';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-circle-xmark';
        if (type === 'warning') icon = 'fa-triangle-exclamation';
        
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    setupSettings() {
        const settingsModal = document.getElementById('settings-modal');
        const settingsBtn = document.getElementById('settings-btn');
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const clearHistoryBtn = document.getElementById('clear-history-btn');
        const fontSlider = document.getElementById('font-size-slider');
        const fontValue = document.getElementById('font-size-value');
        
        // Load saved settings
        const savedSettings = JSON.parse(localStorage.getItem('probot_settings') || '{}');
        
        if (savedSettings.fontSize) {
            fontSlider.value = savedSettings.fontSize;
            fontValue.textContent = savedSettings.fontSize + 'px';
            document.documentElement.style.setProperty('--chat-font-size', savedSettings.fontSize + 'px');
            document.querySelector('.messages-container').style.fontSize = savedSettings.fontSize + 'px';
        }
        if (savedSettings.voiceLang) {
            document.getElementById('voice-lang-select').value = savedSettings.voiceLang;
            if (this.voiceController && this.voiceController.recognition) {
                this.voiceController.recognition.lang = savedSettings.voiceLang;
            }
        }
        if (savedSettings.messageStyle) {
            document.getElementById('message-style-select').value = savedSettings.messageStyle;
            if (savedSettings.messageStyle === 'flat') {
                document.querySelector('.messages-container').classList.add('flat-style');
            }
        }
        if (savedSettings.autoSearch !== undefined) {
            document.getElementById('auto-search-toggle').checked = savedSettings.autoSearch;
        }
        if (savedSettings.enterSend !== undefined) {
            document.getElementById('enter-send-toggle').checked = savedSettings.enterSend;
        }

        // Open/Close
        settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.classList.add('hidden');
        });

        // Font size live preview
        fontSlider.addEventListener('input', () => {
            fontValue.textContent = fontSlider.value + 'px';
            document.querySelector('.messages-container').style.fontSize = fontSlider.value + 'px';
        });

        // Save
        saveSettingsBtn.addEventListener('click', () => {
            const settings = {
                fontSize: fontSlider.value,
                messageStyle: document.getElementById('message-style-select').value,
                voiceLang: document.getElementById('voice-lang-select').value,
                autoSearch: document.getElementById('auto-search-toggle').checked,
                enterSend: document.getElementById('enter-send-toggle').checked
            };
            
            localStorage.setItem('probot_settings', JSON.stringify(settings));
            
            // Apply voice language
            if (this.voiceController && this.voiceController.recognition) {
                this.voiceController.recognition.lang = settings.voiceLang;
            }
            
            // Apply message style
            const container = document.querySelector('.messages-container');
            if (settings.messageStyle === 'flat') {
                container.classList.add('flat-style');
            } else {
                container.classList.remove('flat-style');
            }
            
            settingsModal.classList.add('hidden');
            this.showToast('Settings saved!', 'success');
        });

        // Clear all chats
        clearHistoryBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete ALL chats? This cannot be undone.')) return;
            
            try {
                // Delete all sessions
                for (const session of this.chatController.sessions) {
                    await this.apiRequest(`/api/sessions/${session.id}`, { method: 'DELETE' });
                }
                this.chatController.sessions = [];
                this.chatController.sessionId = null;
                this.chatController.renderSessionList();
                
                // Show welcome screen
                const container = this.chatController.elements.container;
                Array.from(container.children).forEach(child => {
                    if (child.id !== 'welcome-screen') child.remove();
                });
                document.getElementById('welcome-screen').classList.remove('hidden');
                
                settingsModal.classList.add('hidden');
                this.showToast('All chats cleared!', 'success');
            } catch (e) {
                this.showToast('Failed to clear chats', 'error');
            }
        });
    }
}

// Boot application
window.addEventListener('DOMContentLoaded', () => {
    window.app = new ProbotApp();
});
