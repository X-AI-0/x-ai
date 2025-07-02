// Chat Page JavaScript
import { ApiService } from '../../js/services/apiService.js';
import { WebSocketService } from '../../js/services/websocketService.js';
import { ToastManager } from '../../js/utils/toastManager.js';

class ChatPage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        this.availableModels = [];
        this.selectedModel = null;
        this.chatHistory = [];
        this.isStreaming = false;
        this.currentStreamingMessageId = null;
        this.currentChatId = null;
        this.savedChats = [];
        
        // Background streaming management
        this.backgroundStreams = new Map(); // chatId -> { messageId, isStreaming, content }
        this.streamingStates = new Map(); // chatId -> streaming state
        
        this.init();
        
        // Start periodic update for background streaming indicators
        this.startPeriodicUpdate();
    }

    async init() {
        console.log('Chat page initialized');
        await this.setupWebSocket();
        await this.loadModels();
        await this.loadSavedChats();
        await this.loadChatStorageInfo();
        this.setupEventListeners();
        this.updateUI();
    }

    async setupWebSocket() {
        try {
            await this.wsService.connect();
            this.updateConnectionStatus(true);
            
            this.wsService.on('disconnect', () => {
                this.updateConnectionStatus(false);
            });
            
            this.wsService.on('reconnect', () => {
                this.updateConnectionStatus(true);
            });
            
            // Handle streaming chat responses
            this.wsService.on('chat_response', (data) => {
                this.handleChatResponse(data);
            });
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const icon = statusElement.querySelector('i');
        const text = statusElement.querySelector('span');
        
        if (connected) {
            statusElement.className = 'status-indicator connected';
            icon.className = 'fas fa-circle';
            text.textContent = 'Connected';
        } else {
            statusElement.className = 'status-indicator disconnected';
            icon.className = 'fas fa-circle';
            text.textContent = 'Disconnected';
        }
    }

    async loadModels() {
        try {
            console.log('[CHAT] Loading available models...');
            // Get models from active provider
            const response = await this.apiService.getActiveProviderModels();
            console.log('[CHAT] API response:', response);
            
            // Handle different response structures
            if (response && response.success && response.data) {
                this.availableModels = Array.isArray(response.data) ? response.data : [];
            } else if (Array.isArray(response)) {
                this.availableModels = response;
            } else {
                this.availableModels = [];
            }
            
            console.log('[CHAT] Loaded models:', this.availableModels);
            this.populateModelSelect();
            
            // Also load provider info
            await this.loadProviderInfo();
        } catch (error) {
            console.error('[CHAT] Failed to load models:', error);
            this.toastManager.show('Failed to load available models', 'error');
            this.availableModels = [];
            this.populateModelSelect(); // Still populate to show "No models available"
        }
    }

    async loadProviderInfo() {
        try {
            const response = await this.apiService.getProviders();
            console.log('[CHAT] Providers response:', response);
            
            let providers = [];
            if (response && response.success && response.data) {
                if (response.data.providers) {
                    providers = response.data.providers;
                    this.activeProvider = response.data.providers.find(p => p.id === response.data.activeProvider);
                } else if (Array.isArray(response.data)) {
                    providers = response.data;
                    this.activeProvider = providers.find(p => p.isActive);
                }
            } else if (Array.isArray(response)) {
                providers = response;
                this.activeProvider = providers.find(p => p.isActive);
            }
            
            console.log('[CHAT] Active provider:', this.activeProvider);
            this.updateProviderInfo();
        } catch (error) {
            console.error('[CHAT] Failed to load provider info:', error);
        }
    }

    updateProviderInfo() {
        const providerInfoElement = document.getElementById('providerInfo');
        if (!providerInfoElement) return;

        if (this.activeProvider) {
            providerInfoElement.innerHTML = `
                <div class="provider-status">
                    <span class="provider-name">${this.activeProvider.name}</span>
                    <span class="provider-badge ${this.activeProvider.id}">${this.activeProvider.id.toUpperCase()}</span>
                    <span class="provider-status-indicator ${this.activeProvider.status}">${this.activeProvider.status}</span>
                </div>
            `;
        } else {
            providerInfoElement.innerHTML = `
                <div class="provider-status">
                    <span class="provider-name">No Provider</span>
                    <span class="provider-status-indicator inactive">Inactive</span>
                </div>
            `;
        }
    }

    async loadSavedChats() {
        try {
            console.log('[CHAT] Loading saved chats...');
            const response = await this.apiService.getChats();
            this.savedChats = response.data || [];
            console.log('[CHAT] Loaded saved chats:', this.savedChats.length);
            this.populateChatHistory();
        } catch (error) {
            console.error('[CHAT] Failed to load saved chats:', error);
            this.savedChats = [];
        }
    }

    async loadChatStorageInfo() {
        try {
            const response = await this.apiService.getChatStorageInfo();
            this.updateStorageInfo(response.data);
        } catch (error) {
            console.error('[CHAT] Failed to load storage info:', error);
        }
    }

    populateModelSelect() {
        const modelSelect = document.getElementById('modelSelect');
        if (!modelSelect) return;

        // Clear existing options except the first one
        modelSelect.innerHTML = '<option value="">Choose a model...</option>';

        if (this.availableModels.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No models available';
            option.disabled = true;
            modelSelect.appendChild(option);
            return;
        }

        // Sort models: favorites first, then regular models
        const sortedModels = [...this.availableModels].sort((a, b) => {
            // Favorites first
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            // Then sort by name
            return a.name.localeCompare(b.name);
        });

        // Populate model options with provider info
        sortedModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            
            // Format model display with provider info
            let displayText = model.name;
            
            // Add star for favorites
            if (model.isFavorite) {
                displayText = '⭐ ' + displayText;
            }
            
            if (model.size) {
                displayText += ` (${this.formatSize(model.size)})`;
            } else if (model.context_length) {
                displayText += ` (${this.formatModelSize(model.context_length)})`;
            }
            
            // Add provider badge for non-Ollama models
            if (model.providerId && model.providerId !== 'ollama') {
                displayText += ` [${model.providerName || model.providerId}]`;
            }
            
            option.textContent = displayText;
            modelSelect.appendChild(option);
        });
    }

    formatModelSize(contextLength) {
        if (!contextLength) return 'Unknown';
        if (contextLength >= 1000000) {
            return `${(contextLength / 1000000).toFixed(1)}M tokens`;
        } else if (contextLength >= 1000) {
            return `${(contextLength / 1000).toFixed(0)}K tokens`;
        }
        return `${contextLength} tokens`;
    }

    formatSize(bytes) {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    populateChatHistory() {
        const chatHistoryContainer = document.getElementById('chatHistoryList');
        if (!chatHistoryContainer) return;

        chatHistoryContainer.innerHTML = '';

        if (this.savedChats.length === 0) {
            chatHistoryContainer.innerHTML = `
                <div class="no-chats">
                    <i class="fas fa-comments"></i>
                    <p>No saved chats yet</p>
                </div>
            `;
            return;
        }

        this.savedChats.forEach(chat => {
            const chatItem = document.createElement('div');
            const isActive = chat.id === this.currentChatId;
            const isStreaming = this.backgroundStreams.has(chat.id) && this.backgroundStreams.get(chat.id).isStreaming;
            
            chatItem.className = `chat-history-item ${isActive ? 'active' : ''} ${isStreaming ? 'streaming' : ''}`;
            chatItem.setAttribute('data-chat-id', chat.id);
            chatItem.setAttribute('title', isStreaming ? 'AI is responding in background - Click to view' : 'Click to switch to this chat');

            chatItem.innerHTML = `
                <div class="chat-info">
                    <div class="chat-title">${this.escapeHtml(chat.title)}</div>
                    <div class="chat-meta">
                        <span class="chat-model">${chat.model}</span>
                        <span class="chat-date">${this.formatDate(chat.updatedAt)}</span>
                        <span class="chat-messages">${chat.messageCount || (chat.messages ? chat.messages.length : 0)} messages</span>
                    </div>
                </div>
                <div class="chat-actions">
                    <button class="btn-icon export-chat-btn" title="Export Chat">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon delete-chat-btn" title="Delete Chat">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            chatHistoryContainer.appendChild(chatItem);
        });
    }

    updateStorageInfo(info) {
        const storageInfoContainer = document.getElementById('chatStorageInfo');
        if (!storageInfoContainer) return;

        storageInfoContainer.innerHTML = `
            <div class="storage-stats">
                <div class="stat-item">
                    <i class="fas fa-comments"></i>
                    <span class="stat-value">${info.totalChats}</span>
                    <span class="stat-label">Chats</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-message"></i>
                    <span class="stat-value">${info.totalMessages}</span>
                    <span class="stat-label">Messages</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-hdd"></i>
                    <span class="stat-value">${this.formatSize(info.storageSize)}</span>
                    <span class="stat-label">Storage</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-archive"></i>
                    <span class="stat-value">${info.backupCount}</span>
                    <span class="stat-label">Backups</span>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    setupEventListeners() {
        // Model selection
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                this.selectedModel = e.target.value;
                this.updateUI();
            });
        }

        // Message input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', () => {
                this.autoResizeTextarea(messageInput);
                this.updateSendButton();
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.sendMessage();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Send button
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Stop button
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopStreaming();
            });
        }

        // Clear chat button
        const clearChatBtn = document.getElementById('clearChatBtn');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => {
                this.clearChat();
            });
        }

        // New chat button
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                this.newChat();
            });
        }

        // Quick prompt buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('prompt-btn') || e.target.closest('.prompt-btn')) {
                const button = e.target.classList.contains('prompt-btn') ? e.target : e.target.closest('.prompt-btn');
                const prompt = button.getAttribute('data-prompt');
                if (prompt) {
                    this.useQuickPrompt(prompt);
                }
            }
        });

        // Chat history management
        document.addEventListener('click', (e) => {
            const chatItem = e.target.closest('.chat-history-item');
            if (!chatItem) return;

            const chatId = chatItem.getAttribute('data-chat-id');

            // Handle action buttons
            if (e.target.closest('.export-chat-btn')) {
                e.stopPropagation();
                this.exportChat(chatId);
            } else if (e.target.closest('.delete-chat-btn')) {
                e.stopPropagation();
                this.deleteChat(chatId);
            } else {
                // Direct click on chat item - switch to this chat
                this.loadChat(chatId);
            }
        });

        // Storage management buttons
        const refreshStorageBtn = document.getElementById('refreshChatStorageBtn');
        if (refreshStorageBtn) {
            refreshStorageBtn.addEventListener('click', () => {
                this.loadChatStorageInfo();
                this.loadSavedChats();
            });
        }

        const createBackupBtn = document.getElementById('createChatBackupBtn');
        if (createBackupBtn) {
            createBackupBtn.addEventListener('click', () => {
                this.createChatBackup();
            });
        }

        const cleanupStorageBtn = document.getElementById('cleanupChatStorageBtn');
        if (cleanupStorageBtn) {
            cleanupStorageBtn.addEventListener('click', () => {
                this.cleanupChatStorage();
            });
        }
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    updateSendButton() {
        const sendBtn = document.getElementById('sendBtn');
        const messageInput = document.getElementById('messageInput');
        
        if (sendBtn && messageInput) {
            const hasText = messageInput.value.trim().length > 0;
            const hasModel = this.selectedModel && this.selectedModel.length > 0;
            sendBtn.disabled = !hasText || !hasModel || this.isStreaming;
        }
    }

    updateUI() {
        this.updateSendButton();
        this.updateModelInfo();
        this.updateWelcomeMessage();
    }

    updateModelInfo() {
        const modelInfo = document.getElementById('selectedModelInfo');
        if (modelInfo) {
            if (this.selectedModel) {
                const model = this.availableModels.find(m => m.name === this.selectedModel);
                let displayText = `Selected: ${this.selectedModel}`;
                
                if (model && model.providerId && model.providerId !== 'ollama') {
                    displayText += ` [${model.providerName || model.providerId}]`;
                }
                
                modelInfo.textContent = displayText;
                modelInfo.style.color = 'var(--primary-color)';
            } else {
                modelInfo.textContent = 'No model selected';
                modelInfo.style.color = 'var(--text-secondary)';
            }
        }
    }



    updateWelcomeMessage() {
        const welcomeMessage = document.querySelector('.welcome-message');
        const chatMessages = document.getElementById('chatMessages');
        
        if (welcomeMessage && chatMessages) {
            if (this.chatHistory.length === 0) {
                welcomeMessage.style.display = 'block';
            } else {
                welcomeMessage.style.display = 'none';
            }
        }
    }

    useQuickPrompt(prompt) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = prompt;
            this.autoResizeTextarea(messageInput);
            this.updateSendButton();
            messageInput.focus();
        }
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !this.selectedModel) return;

        const message = messageInput.value.trim();
        if (!message) return;

        // Create or get current chat
        if (!this.currentChatId) {
            await this.createNewChat();
        }

        const chatId = this.currentChatId;

        // Add user message to chat
        const userMessageId = this.addMessage('user', message);
        
        // Save user message to persistent storage
        if (chatId) {
            try {
                await this.apiService.addChatMessage(chatId, 'user', message);
            } catch (error) {
                console.error('[CHAT] Failed to save user message:', error);
            }
        }
        
        // Clear input
        messageInput.value = '';
        this.autoResizeTextarea(messageInput);
        
        // Update UI state for current chat
        this.isStreaming = true;
        this.updateUI();
        this.showTypingIndicator();

        try {
            // Create assistant message placeholder
            const assistantMessageId = this.addStreamingMessage();
            this.currentStreamingMessageId = assistantMessageId;

            // Set up background streaming state
            this.backgroundStreams.set(chatId, {
                messageId: assistantMessageId,
                isStreaming: true,
                content: '',
                model: this.selectedModel
            });

            // Prepare context
            const context = this.prepareContext();
            console.log('[CHAT] Sending context:', context);

            // Send message with streaming - this will continue in background
            this.startBackgroundStreaming(chatId, assistantMessageId, context);

        } catch (error) {
            console.error('[CHAT] Failed to send message:', error);
            this.toastManager.show(`Failed to send message: ${error.message}`, 'error');
            this.removeStreamingMessage();
            this.backgroundStreams.delete(chatId);
        }
    }

    async startBackgroundStreaming(chatId, messageId, context) {
        try {
            // Get provider ID for the selected model
            const selectedModelObj = this.availableModels.find(m => m.name === this.selectedModel);
            const providerId = selectedModelObj?.providerId || null;
            
            await this.apiService.chatStream(this.selectedModel, context, (chunk) => {
                this.handleBackgroundStreamingChunk(chatId, messageId, chunk);
            }, providerId);
            console.log(`[CHAT] Background streaming completed for chat: ${chatId}`);
        } catch (error) {
            console.error(`[CHAT] Background streaming failed for chat ${chatId}:`, error);
            this.handleStreamingError(chatId, messageId, error);
        }
    }

    handleBackgroundStreamingChunk(chatId, messageId, chunk) {
        const streamState = this.backgroundStreams.get(chatId);
        if (!streamState) return;

        // Update background content
        if (chunk.message && chunk.message.content) {
            streamState.content += chunk.message.content;
        }

        // If this is the currently active chat, update UI
        if (chatId === this.currentChatId) {
            this.handleStreamingChunk(messageId, chunk);
        }

        // Handle completion
        if (chunk.done) {
            this.handleBackgroundStreamingComplete(chatId, messageId, streamState.content);
        }
    }

    handleBackgroundStreamingComplete(chatId, messageId, finalContent) {
        const streamState = this.backgroundStreams.get(chatId);
        if (!streamState) return;

        // Mark as completed
        streamState.isStreaming = false;

        // Save to persistent storage
        if (finalContent) {
            this.apiService.addChatMessage(chatId, 'assistant', finalContent)
                .catch(error => {
                    console.error(`[CHAT] Failed to save assistant message for chat ${chatId}:`, error);
                });
        }

        // If this is the currently active chat, update UI
        if (chatId === this.currentChatId) {
                this.isStreaming = false;
                this.hideTypingIndicator();
                this.updateUI();
            this.currentStreamingMessageId = null;
        }

        // Clean up background stream
        this.backgroundStreams.delete(chatId);

        console.log(`[CHAT] Background streaming completed for chat: ${chatId}`);
    }

    handleStreamingError(chatId, messageId, error) {
        const streamState = this.backgroundStreams.get(chatId);
        if (streamState) {
            streamState.isStreaming = false;
        }

        // If this is the currently active chat, show error
        if (chatId === this.currentChatId) {
            this.isStreaming = false;
            this.hideTypingIndicator();
            this.updateUI();
            this.removeStreamingMessage();
            this.toastManager.show(`Streaming failed: ${error.message}`, 'error');
        }

        this.backgroundStreams.delete(chatId);
    }

    prepareContext() {
        // Prepare conversation context for the model
        const context = [];
        
        // Add system message
        context.push({
            role: 'system',
            content: 'You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions.'
        });

        // Add recent chat history (limit to last 10 messages for performance)
        const recentHistory = this.chatHistory.slice(-10);
        recentHistory.forEach(msg => {
            context.push({
                role: msg.role,
                content: msg.content
            });
        });

        return context;
    }

    addMessage(role, content, timestamp = new Date()) {
        const message = {
            id: this.generateId(),
            role: role,
            content: content,
            timestamp: timestamp
        };

        this.chatHistory.push(message);
        this.renderMessage(message);
        this.updateWelcomeMessage();
        this.scrollToBottom();

        return message.id;
    }

    addStreamingMessage() {
        const messageId = this.generateId();
        const message = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            streaming: true
        };

        this.chatHistory.push(message);
        this.renderMessage(message);
        this.updateWelcomeMessage();
        this.scrollToBottom();

        return messageId;
    }

    handleStreamingChunk(messageId, chunk) {
        // Only log important events, not every chunk
        if (chunk.done) {
            console.log('[CHAT] 🏁 Stream completed for message:', messageId);
            
            // Check GPU usage information if available
            if (chunk.eval_count || chunk.load_duration || chunk.prompt_eval_count) {
                console.log('[CHAT] 📊 Performance metrics:', {
                    eval_count: chunk.eval_count,
                    eval_duration: chunk.eval_duration,
                    load_duration: chunk.load_duration,
                    prompt_eval_count: chunk.prompt_eval_count,
                    prompt_eval_duration: chunk.prompt_eval_duration
                });
                
                // Calculate tokens per second to estimate if GPU is being used
                if (chunk.eval_count && chunk.eval_duration) {
                    const tokensPerSecond = (chunk.eval_count / (chunk.eval_duration / 1000000000)).toFixed(2);
                    console.log(`[CHAT] 🚀 Generation speed: ${tokensPerSecond} tokens/second`);
                    
                    // GPU typically achieves much higher tokens/second than CPU
                    if (tokensPerSecond > 10) {
                        console.log('[CHAT] 🎯 HIGH SPEED - Likely using GPU acceleration!');
                        this.showGPUStatus('GPU', 'success', `${tokensPerSecond} tok/s`);
                    } else {
                        console.log('[CHAT] 🐌 LOW SPEED - Likely using CPU processing');
                        this.showGPUStatus('CPU', 'warning', `${tokensPerSecond} tok/s`);
                    }
                }
            }
        }
        
        if (chunk.message && chunk.message.content) {
            const message = this.chatHistory.find(m => m.id === messageId);
            if (message) {
                message.content += chunk.message.content;
                this.updateStreamingMessage(messageId, message.content, chunk.done);
            }
        }
        
        // Handle completion even if no content
        if (chunk.done) {
            const message = this.chatHistory.find(m => m.id === messageId);
            if (message) {
                this.updateStreamingMessage(messageId, message.content, true);
                
                // Save assistant message to persistent storage
                if (this.currentChatId && message.content) {
                    this.apiService.addChatMessage(this.currentChatId, 'assistant', message.content)
                        .catch(error => {
                            console.error('[CHAT] Failed to save assistant message:', error);
                        });
                }
            }
            this.isStreaming = false;
            this.hideTypingIndicator();
            this.updateUI();
        }
    }

    updateStreamingMessage(messageId, content, isComplete = false) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const contentElement = messageElement.querySelector('.message-content');
            if (contentElement) {
                // Remove typing cursor
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();

                // Update content
                contentElement.innerHTML = this.formatMessageContent(content);
                
                // Add typing cursor if not complete
                if (!isComplete) {
                    contentElement.innerHTML += '<span class="typing-cursor">|</span>';
                }

                // Update message status
                if (isComplete) {
                    messageElement.classList.remove('streaming');
                    const message = this.chatHistory.find(m => m.id === messageId);
                    if (message) {
                        message.streaming = false;
                    }
                }

                this.scrollToBottom();
            }
        }
    }

    removeStreamingMessage() {
        if (this.currentStreamingMessageId) {
            // Remove from chat history
            this.chatHistory = this.chatHistory.filter(m => m.id !== this.currentStreamingMessageId);
            
            // Remove from DOM
            const messageElement = document.querySelector(`[data-message-id="${this.currentStreamingMessageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
            
            this.currentStreamingMessageId = null;
            this.updateWelcomeMessage();
        }
    }

    renderMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}${message.streaming ? ' streaming' : ''}`;
        messageElement.setAttribute('data-message-id', message.id);

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = message.role === 'user' 
            ? '<i class="fas fa-user"></i>' 
            : '<i class="fas fa-robot"></i>';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = this.formatMessageContent(message.content);
        
        if (message.streaming) {
            content.innerHTML += '<span class="typing-cursor">|</span>';
        }

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = this.formatTime(message.timestamp);

        if (message.role === 'user') {
            messageElement.appendChild(content);
            messageElement.appendChild(avatar);
        } else {
            messageElement.appendChild(avatar);
            messageElement.appendChild(content);
        }

        content.appendChild(time);
        chatMessages.appendChild(messageElement);
    }

    formatMessageContent(content) {
        // Basic markdown-like formatting
        let formatted = content
            .replace(/\n/g, '<br>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```([^```]+)```/g, '<pre><code>$1</code></pre>');
        
        return formatted;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    showTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'flex';
        }
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }

    stopStreaming() {
        if (this.isStreaming && this.currentChatId) {
            // Stop background streaming for current chat
            const backgroundStream = this.backgroundStreams.get(this.currentChatId);
            if (backgroundStream) {
                backgroundStream.isStreaming = false;
                this.backgroundStreams.delete(this.currentChatId);
            }
            
            this.isStreaming = false;
            this.hideTypingIndicator();
            this.updateUI();
            
            // Complete the current streaming message
            if (this.currentStreamingMessageId) {
                const message = this.chatHistory.find(m => m.id === this.currentStreamingMessageId);
                if (message) {
                    this.updateStreamingMessage(this.currentStreamingMessageId, message.content, true);
                    
                    // Save partial content to storage
                    if (message.content && this.currentChatId) {
                        this.apiService.addChatMessage(this.currentChatId, 'assistant', message.content)
                            .catch(error => {
                                console.error('[CHAT] Failed to save partial message:', error);
                            });
                    }
                }
            }
            
            this.currentStreamingMessageId = null;
            this.toastManager.show('Streaming stopped', 'info');
        }
    }

    clearChat() {
        if (this.chatHistory.length === 0) return;

        if (confirm('Are you sure you want to clear the current chat display? (This won\'t delete saved chats)')) {
            this.chatHistory = [];
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                // Remove all messages except welcome message
                const messages = chatMessages.querySelectorAll('.message');
                messages.forEach(msg => msg.remove());
            }
            this.updateWelcomeMessage();
            this.toastManager.show('Chat display cleared', 'success');
        }
    }

    async newChat() {
        // Deactivate current chat if exists (but don't clear UI)
        if (this.currentChatId) {
            await this.deactivateCurrentChat();
        }
        
        // Reset to new chat state
        this.currentChatId = null;
        this.chatHistory = [];
        
        // Clear the chat messages display
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        
        this.updateUI();
        this.populateChatHistory(); // Update active state
        
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
        
        console.log('[CHAT] Started new chat session');
    }

    async createNewChat() {
        if (!this.selectedModel) {
            this.toastManager.show('Please select a model first', 'warning');
            return;
        }

        try {
            // Deactivate current chat if exists (but don't clear UI)
            if (this.currentChatId) {
                await this.deactivateCurrentChat();
            }

            const response = await this.apiService.createChat(this.selectedModel);
            this.currentChatId = response.data.id;
            console.log('[CHAT] Created new chat:', this.currentChatId);
            
            // Refresh saved chats list
            await this.loadSavedChats();
            
            return this.currentChatId;
        } catch (error) {
            console.error('[CHAT] Failed to create new chat:', error);
            this.toastManager.show('Failed to create new chat', 'error');
            return null;
        }
    }

    async deactivateCurrentChat() {
        if (!this.currentChatId) return;
        
        try {
            // Don't stop streaming - let it continue in background
            // Just update UI state
            if (this.isStreaming) {
                this.isStreaming = false;
                this.hideTypingIndicator();
                this.currentStreamingMessageId = null;
            }
            
            // Deactivate the chat on the server (but keep background streaming)
            await this.apiService.deactivateChat(this.currentChatId);
            console.log(`[CHAT] Deactivated chat: ${this.currentChatId} (background streaming continues)`);
        } catch (error) {
            console.error('[CHAT] Failed to deactivate current chat:', error);
        }
    }

    async loadChat(chatId) {
        try {
            // If already viewing this chat, do nothing
            if (this.currentChatId === chatId) {
                return;
            }

            const response = await this.apiService.getChat(chatId);
            const chat = response.data;
            
            // Deactivate current chat if exists (but don't clear UI)
            if (this.currentChatId) {
                await this.deactivateCurrentChat();
            }
            
            // Set current chat
            this.currentChatId = chatId;
            this.selectedModel = chat.model;
            
            // Update model selector
            const modelSelect = document.getElementById('modelSelect');
            if (modelSelect) {
                modelSelect.value = chat.model;
            }
            
            // Load messages (with null check)
            this.chatHistory = (chat.messages || []).map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            }));
            
            // Check if there's a background streaming for this chat
            const backgroundStream = this.backgroundStreams.get(chatId);
            if (backgroundStream && backgroundStream.isStreaming) {
                // Add the streaming message to chat history if not already there
                const existingMessage = this.chatHistory.find(m => m.id === backgroundStream.messageId);
                if (!existingMessage) {
                    this.chatHistory.push({
                        id: backgroundStream.messageId,
                        role: 'assistant',
                        content: backgroundStream.content,
                        timestamp: new Date(),
                        streaming: true
                    });
                } else {
                    // Update existing message with current content
                    existingMessage.content = backgroundStream.content;
                    existingMessage.streaming = true;
                }
                
                // Set streaming state for UI
                this.isStreaming = true;
                this.currentStreamingMessageId = backgroundStream.messageId;
            }
            
            // Render messages
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
                this.chatHistory.forEach(message => {
                    this.renderMessage(message);
                });
            }
            
            // Update UI state
            this.updateUI();
            this.populateChatHistory(); // Update active state
            this.scrollToBottom();
            
            // Show typing indicator if streaming
            if (this.isStreaming) {
                this.showTypingIndicator();
            }
            
            console.log(`[CHAT] Switched to chat: ${chat.title}${backgroundStream && backgroundStream.isStreaming ? ' (streaming in progress)' : ''}`);
            
        } catch (error) {
            console.error('[CHAT] Failed to load chat:', error);
            this.toastManager.show('Failed to load chat', 'error');
        }
    }

    async exportChat(chatId) {
        try {
            // Show export options
            const format = await this.showExportDialog();
            if (!format) return;
            
            const data = await this.apiService.exportChat(chatId, format);
            
            // Create download
            const blob = new Blob([format === 'json' ? JSON.stringify(data, null, 2) : data], {
                type: format === 'json' ? 'application/json' : 'text/plain'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-${chatId}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.toastManager.show('Chat exported successfully', 'success');
            
        } catch (error) {
            console.error('[CHAT] Failed to export chat:', error);
            this.toastManager.show('Failed to export chat', 'error');
        }
    }

    async deleteChat(chatId) {
        const chat = this.savedChats.find(c => c.id === chatId);
        if (!chat) return;
        
        if (!confirm(`Are you sure you want to delete "${chat.title}"?`)) {
            return;
        }
        
        try {
            await this.apiService.deleteChat(chatId);
            
            // If this is the current chat, clear it
            if (this.currentChatId === chatId) {
                this.clearChat();
                this.currentChatId = null;
            }
            
            // Refresh saved chats list
            await this.loadSavedChats();
            await this.loadChatStorageInfo();
            
            this.toastManager.show('Chat deleted successfully', 'success');
            
        } catch (error) {
            console.error('[CHAT] Failed to delete chat:', error);
            this.toastManager.show('Failed to delete chat', 'error');
        }
    }

    async createChatBackup() {
        try {
            await this.apiService.createChatBackup();
            await this.loadChatStorageInfo();
            this.toastManager.show('Backup created successfully', 'success');
        } catch (error) {
            console.error('[CHAT] Failed to create backup:', error);
            this.toastManager.show('Failed to create backup', 'error');
        }
    }

    async cleanupChatStorage() {
        if (!confirm('Are you sure you want to cleanup old backups?')) {
            return;
        }
        
        try {
            await this.apiService.cleanupChatStorage();
            await this.loadChatStorageInfo();
            this.toastManager.show('Storage cleanup completed', 'success');
        } catch (error) {
            console.error('[CHAT] Failed to cleanup storage:', error);
            this.toastManager.show('Failed to cleanup storage', 'error');
        }
    }

    showExportDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'export-dialog-overlay';
            dialog.innerHTML = `
                <div class="export-dialog">
                    <h3>Export Chat</h3>
                    <p>Choose export format:</p>
                    <div class="export-options">
                        <button class="btn btn-primary" data-format="json">JSON</button>
                        <button class="btn btn-secondary" data-format="txt">Text</button>
                        <button class="btn btn-outline" data-format="cancel">Cancel</button>
                    </div>
                </div>
            `;
            
            dialog.addEventListener('click', (e) => {
                const format = e.target.getAttribute('data-format');
                if (format) {
                    document.body.removeChild(dialog);
                    resolve(format === 'cancel' ? null : format);
                }
            });
            
            document.body.appendChild(dialog);
        });
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    generateId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    showGPUStatus(type, status, speed) {
        // Create or update GPU status indicator
        let gpuIndicator = document.getElementById('gpuStatusIndicator');
        
        if (!gpuIndicator) {
            gpuIndicator = document.createElement('div');
            gpuIndicator.id = 'gpuStatusIndicator';
            gpuIndicator.className = 'gpu-status-indicator';
            
            // Find a good place to insert it (near the model selector)
            const modelSection = document.querySelector('.chat-model-info');
            if (modelSection) {
                modelSection.appendChild(gpuIndicator);
            } else {
                document.querySelector('.chat-container').appendChild(gpuIndicator);
            }
        }
        
        // Update the indicator
        gpuIndicator.className = `gpu-status-indicator ${status}`;
        gpuIndicator.innerHTML = `
            <div class="gpu-status-content">
                <i class="fas fa-${type === 'GPU' ? 'microchip' : 'processor'}"></i>
                <span class="gpu-type">${type}</span>
                <span class="gpu-speed">${speed}</span>
            </div>
        `;
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (gpuIndicator && gpuIndicator.parentNode) {
                gpuIndicator.style.opacity = '0.6';
            }
        }, 10000);
    }

    handleChatResponse(data) {
        // Handle WebSocket chat responses if needed
        console.log('[CHAT] Received chat response:', data);
    }

    startPeriodicUpdate() {
        // Update chat history display every 2 seconds to show streaming status
        setInterval(() => {
            if (this.backgroundStreams.size > 0) {
                this.populateChatHistory();
            }
        }, 2000);
    }
}

// Initialize the chat page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatPageInstance = new ChatPage();
}); 