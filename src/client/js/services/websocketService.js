export class WebSocketService {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.onMessage = null;
        this.onConnectionChange = null;
        this.isConnected = false;
        this.eventListeners = new Map(); // Add event listener storage
    }

    // Add event emitter methods
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            try {
                this.ws = new WebSocket(wsUrl);
                this.setupEventListeners();
                
                // Set up promise resolution
                const onOpen = () => {
                    this.ws.removeEventListener('open', onOpen);
                    this.ws.removeEventListener('error', onError);
                    resolve();
                };
                
                const onError = (error) => {
                    this.ws.removeEventListener('open', onOpen);
                    this.ws.removeEventListener('error', onError);
                    reject(error);
                };
                
                this.ws.addEventListener('open', onOpen);
                this.ws.addEventListener('error', onError);
            } catch (error) {
                console.error('WebSocket connection failed:', error);
                this.handleConnectionChange(false);
                this.scheduleReconnect();
                reject(error);
            }
        });
    }

    setupEventListeners() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.handleConnectionChange(true);
            this.emit('connect');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Emit specific events based on message type
                if (data.type) {
                    this.emit(data.type, data);
                }
                
                // Also emit generic message event
                this.emit('message', data);
                
                // Legacy callback support
                if (this.onMessage) {
                    this.onMessage(data);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.handleConnectionChange(false);
            this.emit('disconnect', { code: event.code, reason: event.reason });
            
            // Attempt to reconnect unless it was a clean close
            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.isConnected = false;
            this.handleConnectionChange(false);
            this.emit('error', error);
        };
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket is not connected. Message not sent:', data);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect().then(() => {
                    this.emit('reconnect');
                }).catch(error => {
                    console.error('Reconnection failed:', error);
                });
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    handleConnectionChange(connected) {
        this.isConnected = connected;
        if (this.onConnectionChange) {
            this.onConnectionChange(connected);
        }
    }

    // Convenience methods for specific message types
    subscribeToDiscussion(discussionId) {
        this.send({
            type: 'subscribe_discussion',
            discussionId: discussionId
        });
    }

    unsubscribeFromDiscussion() {
        this.send({
            type: 'unsubscribe_discussion'
        });
    }

    ping() {
        this.send({
            type: 'ping'
        });
    }
} 