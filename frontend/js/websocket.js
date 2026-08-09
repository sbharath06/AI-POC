class WebSocketManager {
    constructor(baseUrl) {
        // Build websocket URL from the base HTTP URL
        const protocol = baseUrl.startsWith('https') ? 'wss:' : 'ws:';
        const host = baseUrl.replace(/^https?:\/\//, '');
        this.url = `${protocol}//${host}/ws/chat`;
        
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000;
        this.baseDelay = 1000;
        this.heartbeatInterval = null;
        
        this.callbacks = {
            onMessage: null,
            onOpen: null,
            onClose: null,
            onError: null
        };
    }

    connect(token) {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = `${this.url}?token=${token}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = (event) => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this._startHeartbeat();
            if (this.callbacks.onOpen) this.callbacks.onOpen(event);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.callbacks.onMessage) this.callbacks.onMessage(data);
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket disconnected');
            this._stopHeartbeat();
            if (this.callbacks.onClose) this.callbacks.onClose(event);
            this._scheduleReconnect(token);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (this.callbacks.onError) this.callbacks.onError(error);
        };
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        console.error('WebSocket is not open. Cannot send message.');
        return false;
    }

    disconnect() {
        this._stopHeartbeat();
        if (this.ws) {
            // Clear onclose handler to prevent reconnect
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    _scheduleReconnect(token) {
        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        
        console.log(`Reconnecting in ${delay}ms...`);
        this.reconnectAttempts++;
        
        setTimeout(() => {
            this.connect(token);
        }, delay);
    }

    getState() {
        return this.ws ? this.ws.readyState : WebSocket.CLOSED;
    }
}
