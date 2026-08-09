class ChatController {
    constructor(wsManager, authManager, app) {
        this.ws = wsManager;
        this.auth = authManager;
        this.app = app;
        
        this.sessionId = null;
        this.sessions = [];
        
        this.elements = {
            container: document.getElementById('messages-container'),
            welcomeScreen: document.getElementById('welcome-screen'),
            input: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-btn'),
            sessionList: document.getElementById('session-list')
        };
        
        this.currentAiMessageDiv = null;
        this.currentAiContent = '';
        this.isGenerating = false;
        
        this.setupMarkdown();
        this.setupEventListeners();
    }

    setupMarkdown() {
        marked.setOptions({
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            }
        });
    }

    setupEventListeners() {
        // Send on enter (without shift)
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });
        
        // Auto-expand input
        this.elements.input.addEventListener('input', () => {
            this.elements.input.style.height = 'auto';
            this.elements.input.style.height = (this.elements.input.scrollHeight) + 'px';
            this.updateSendButtonState();
        });

        this.elements.sendBtn.addEventListener('click', () => this.handleSend());
        
        // Suggestion cards
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                this.elements.input.value = prompt;
                this.updateSendButtonState();
                this.handleSend();
            });
        });
    }
    
    updateSendButtonState() {
        const hasText = this.elements.input.value.trim().length > 0;
        this.elements.sendBtn.disabled = !hasText || this.isGenerating;
    }

    async loadSessions() {
        try {
            const sessions = await this.app.apiRequest('/api/sessions');
            this.sessions = sessions;
            this.renderSessionList();
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }
    
    renderSessionList() {
        this.elements.sessionList.innerHTML = '';
        this.sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = `session-item ${session.id === this.sessionId ? 'active' : ''}`;
            item.innerHTML = `
                <i class="fa-regular fa-message"></i>
                <span class="session-title-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${session.title || 'New Chat'}</span>
                <div class="session-actions">
                    <button class="session-action-btn rename" title="Rename"><i class="fa-solid fa-pen"></i></button>
                    <button class="session-action-btn delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            // Click to open session
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.session-action-btn')) {
                    this.setActiveSession(session.id);
                }
            });
            
            // Rename
            item.querySelector('.rename').addEventListener('click', (e) => {
                e.stopPropagation();
                this.startRename(item, session);
            });
            
            // Delete
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSession(session.id);
            });
            
            this.elements.sessionList.appendChild(item);
        });
    }

    startRename(item, session) {
        const titleSpan = item.querySelector('.session-title-text');
        const currentTitle = session.title || 'New Chat';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'session-rename-input';
        input.value = currentTitle;
        
        titleSpan.replaceWith(input);
        input.focus();
        input.select();
        
        const save = async () => {
            const newTitle = input.value.trim() || currentTitle;
            try {
                await this.app.apiRequest(`/api/sessions/${session.id}/rename`, {
                    method: 'PUT',
                    body: JSON.stringify({ title: newTitle })
                });
                session.title = newTitle;
            } catch(e) {
                this.app.showToast('Failed to rename', 'error');
            }
            this.renderSessionList();
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') this.renderSessionList();
        });
    }

    async deleteSession(id) {
        try {
            await this.app.apiRequest(`/api/sessions/${id}`, { method: 'DELETE' });
            this.sessions = this.sessions.filter(s => s.id !== id);
            if (this.sessionId === id) {
                this.sessionId = null;
                this.elements.welcomeScreen.classList.remove('hidden');
                // Clear messages
                Array.from(this.elements.container.children).forEach(child => {
                    if (child.id !== 'welcome-screen') child.remove();
                });
            }
            this.renderSessionList();
            this.app.showToast('Chat deleted', 'success');
        } catch(e) {
            this.app.showToast('Failed to delete chat', 'error');
        }
    }

    async createSession() {
        try {
            const session = await this.app.apiRequest('/api/sessions', { method: 'POST' });
            this.sessions.unshift(session);
            await this.setActiveSession(session.id);
            this.renderSessionList();
        } catch (error) {
            this.app.showToast('Failed to create session', 'error');
        }
    }

    async setActiveSession(id) {
        this.sessionId = id;
        this.renderSessionList();
        this.elements.welcomeScreen.classList.add('hidden');
        
        // Clear current messages
        Array.from(this.elements.container.children).forEach(child => {
            if (child.id !== 'welcome-screen') {
                child.remove();
            }
        });
        
        try {
            const messages = await this.app.apiRequest(`/api/sessions/${id}/messages`);
            if (messages.length === 0) {
                this.elements.welcomeScreen.classList.remove('hidden');
            } else {
                messages.forEach(msg => {
                    this.renderMessage(msg.role, msg.content, msg.sources);
                });
                this.scrollToBottom();
            }
        } catch (error) {
            this.app.showToast('Failed to load messages', 'error');
        }
    }

    async handleSend() {
        if (this.isGenerating) return;
        
        const text = this.elements.input.value.trim();
        if (!text) return;
        

        
        this.elements.input.value = '';
        this.elements.input.style.height = 'auto';
        this.updateSendButtonState();
        this.elements.welcomeScreen.classList.add('hidden');
        
        // Render user message immediately
        this.renderMessage('user', text);
        
        // Add typing indicator
        this.showTypingIndicator();
        this.isGenerating = true;
        this.elements.sendBtn.disabled = true;
        this.elements.sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
        
        // Check WS state
        if (this.ws.getState() !== WebSocket.OPEN) {
            // Fallback to REST if WS is down
            try {
                const response = await this.app.apiRequest(`/api/chat`, {
                    method: 'POST',
                    body: JSON.stringify({
                        session_id: this.sessionId,
                        message: text
                    })
                });
                this.removeTypingIndicator();
                this.renderMessage('ai', response.message);
                
                // Update session if new
                if (!this.sessionId && response.session_id) {
                    this.sessionId = response.session_id;
                    this.sessions.unshift({ id: response.session_id, title: response.session_title || text.substring(0, 30) });
                    this.renderSessionList();
                }
                
                this.isGenerating = false;
                this.resetSendButton();
            } catch (error) {
                this.removeTypingIndicator();
                this.app.showToast('Failed to send message', 'error');
                this.isGenerating = false;
                this.resetSendButton();
            }
            return;
        }
        
        // Send via WebSocket
        this.currentAiContent = '';
        this.ws.send({
            type: 'chat_message',
            session_id: this.sessionId,
            message: text
        });
    }

    resetSendButton() {
        this.elements.sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        this.updateSendButtonState();
    }

    renderMessage(role, content, sources = null) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${role}`;
        
        let avatar = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';
        
        // Parse markdown and sanitize (basic sanitization via marked config typically enough for this, but ideally DOMPurify would be used)
        const rawHtml = marked.parse(content || '');
        const htmlContent = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
        
        wrapper.innerHTML = `
            <div class="message ${role}">
                <div class="message-avatar">${avatar}</div>
                <div class="message-content markdown-body">
                    ${htmlContent}
                </div>
            </div>
        `;
        
        this.elements.container.appendChild(wrapper);
        this.setupCodeBlocks(wrapper);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const wrapper = document.createElement('div');
        wrapper.id = 'typing-indicator-wrapper';
        wrapper.className = 'message-wrapper ai';
        wrapper.innerHTML = `
            <div class="message ai">
                <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="message-content">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;
        this.elements.container.appendChild(wrapper);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator-wrapper');
        if (indicator) indicator.remove();
    }

    setupCodeBlocks(container) {
        container.querySelectorAll('pre').forEach(pre => {
            // Add copy button if not exists
            if (!pre.querySelector('.copy-code-btn')) {
                const btn = document.createElement('button');
                btn.className = 'copy-code-btn';
                btn.innerHTML = 'Copy';
                btn.addEventListener('click', () => {
                    const code = pre.querySelector('code').innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        btn.innerHTML = 'Copied!';
                        setTimeout(() => btn.innerHTML = 'Copy', 2000);
                    });
                });
                pre.appendChild(btn);
            }
        });
    }

    handleStreamToken(token) {
        if (!this.currentAiMessageDiv) {
            this.removeTypingIndicator();
            
            // Create container for new AI message
            const wrapper = document.createElement('div');
            wrapper.className = 'message-wrapper ai';
            wrapper.innerHTML = `
                <div class="message ai">
                    <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
                    <div class="message-content markdown-body" id="current-streaming-content"></div>
                </div>
            `;
            this.elements.container.appendChild(wrapper);
            this.currentAiMessageDiv = document.getElementById('current-streaming-content');
        }
        
        this.currentAiContent += token;
        this.currentAiMessageDiv.innerHTML = marked.parse(this.currentAiContent);
        this.setupCodeBlocks(this.currentAiMessageDiv.parentElement);
        this.scrollToBottom();
    }

    handleStreamComplete(data) {
        this.isGenerating = false;
        if (this.currentAiMessageDiv) {
            this.currentAiMessageDiv.removeAttribute('id');
            this.currentAiMessageDiv = null;
        }
        if (data && data.session_id) {
            this.sessionId = data.session_id;
        }
        this.resetSendButton();
        this.loadSessions(); // Refresh list to get updated title
    }

    handleError(msg) {
        this.removeTypingIndicator();
        this.app.showToast(msg || 'An error occurred', 'error');
        this.isGenerating = false;
        this.resetSendButton();
    }

    scrollToBottom() {
        this.elements.container.scrollTop = this.elements.container.scrollHeight;
    }
}
