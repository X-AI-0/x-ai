// Discussion Page JavaScript
import { ApiService } from '../../js/services/apiService.js';
import { WebSocketService } from '../../js/services/websocketService.js';
import { ToastManager } from '../../js/utils/toastManager.js';

class DiscussionPage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        this.availableModels = [];
        this.selectedModels = [];
        this.syncInterval = null; // For periodic message sync
        this.debugMode = true; // Enable debug logging
        
        // Performance optimization properties
        this.updateQueue = new Map(); // Queue UI updates to batch them
        this.updateTimer = null; // Timer for batched updates
        this.lastUpdateTime = 0; // Track last update time
        this.maxUpdateFrequency = 200; // Maximum update frequency in ms
        this.messageCache = new Map(); // Cache message elements
        this.isUpdating = false; // Prevent concurrent updates
        
        this.init();
    }

    async init() {
        console.log('Discussion page initialized');
        await this.setupWebSocket();
        await this.loadModels();
        await this.loadDiscussions();
        await this.loadStorageInfo();
        this.setupEventListeners();
        
        // Start performance optimization
        this.startPerformanceOptimization();
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
                this.loadDiscussions(); // Reload discussions when reconnected
            });
            
            this.wsService.on('discussion_update', (data) => {
                // Queue updates instead of processing immediately
                this.queueUpdate('discussion_update', data);
            });
            
            // Also listen for direct message events (in case they're sent directly)
            this.wsService.on('message_started', (data) => {
                this.queueUpdate('message_started', data);
            });
            
            this.wsService.on('message_complete', (data) => {
                this.queueUpdate('message_complete', data);
            });
            
            this.wsService.on('message_token', (data) => {
                this.queueUpdate('message_token', data);
            });
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.updateConnectionStatus(false);
        }
    }

    /**
     * Queue updates for batched processing to improve performance
     */
    queueUpdate(type, data) {
        const key = `${type}-${data.discussionId || 'global'}-${data.messageId || 'none'}`;
        
        // Store the latest update for each key
        this.updateQueue.set(key, { type, data, timestamp: Date.now() });
        
        // Schedule batch processing
        this.scheduleBatchUpdate();
    }

    /**
     * Schedule batched update processing
     */
    scheduleBatchUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = setTimeout(() => {
            this.processBatchedUpdates();
        }, 50); // Process updates every 50ms
    }

    /**
     * Process all queued updates in batch
     */
    processBatchedUpdates() {
        if (this.isUpdating) return;
        
        this.isUpdating = true;
        const now = Date.now();
        
        try {
            // Sort updates by timestamp to process in order
            const updates = Array.from(this.updateQueue.values())
                .sort((a, b) => a.timestamp - b.timestamp);
            
            // Group updates by type for efficient processing
            const groupedUpdates = {};
            updates.forEach(update => {
                if (!groupedUpdates[update.type]) {
                    groupedUpdates[update.type] = [];
                }
                groupedUpdates[update.type].push(update.data);
            });
            
            // Process each type of update
            Object.entries(groupedUpdates).forEach(([type, dataArray]) => {
                this.processBatchedUpdateType(type, dataArray);
            });
            
            // Clear the queue
            this.updateQueue.clear();
            this.lastUpdateTime = now;
            
        } catch (error) {
            console.error('[DISCUSSION] Error processing batched updates:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Process batched updates by type
     */
    processBatchedUpdateType(type, dataArray) {
        switch (type) {
            case 'discussion_update':
                dataArray.forEach(data => this.handleDiscussionUpdateOptimized(data));
                break;
            case 'message_started':
                dataArray.forEach(data => this.handleDiscussionUpdateOptimized({ type: 'message_started', ...data }));
                break;
            case 'message_complete':
                dataArray.forEach(data => this.handleDiscussionUpdateOptimized({ type: 'message_complete', ...data }));
                break;
            case 'message_token':
                // For token updates, only process the latest one for each message
                const latestTokenUpdates = new Map();
                dataArray.forEach(data => {
                    latestTokenUpdates.set(data.messageId, data);
                });
                latestTokenUpdates.forEach(data => this.handleDiscussionUpdateOptimized({ type: 'message_token', ...data }));
                break;
        }
    }

    /**
     * Optimized discussion update handler with reduced DOM operations
     */
    handleDiscussionUpdateOptimized(data) {
        // Handle different types of updates with optimized refresh strategy
        switch (data.type) {
            case 'discussion_completed':
                this.loadDiscussions();
                this.refreshCurrentDiscussionViewOptimized();
                // Update download button visibility in modal if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDownloadButtonVisibility(data.discussionId);
                }
                this.toastManager.show('Discussion completed!', 'success');
                break;
            case 'discussion_started':
                this.loadDiscussions();
                // Update current view if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                this.toastManager.show('Discussion started - watch models respond in real-time!', 'success');
                break;
            case 'discussion_stopped':
                this.loadDiscussions();
                // Update current view if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                this.toastManager.show('Discussion stopped', 'warning');
                break;
            case 'message_started':
                // Add new message placeholder for real-time streaming
                this.addStreamingMessagePlaceholderOptimized(data.message);
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.message.discussionId) {
                    this.toastManager.show(`${data.message.modelName} is responding...`, 'info');
                }
                break;
            case 'message_token':
                // Handle real-time token-by-token streaming with throttling
                this.updateStreamingTokenOptimized(data);
                break;
            case 'message_streaming':
                // Handle periodic full content updates
                this.updateStreamingMessageOptimized(data);
                break;
            case 'message_complete':
                // Message is complete, update final state
                this.completeStreamingMessageOptimized(data);
                // If viewing this discussion but message doesn't exist in DOM, add it
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.message.discussionId) {
                    const existingMessage = document.querySelector(`[data-message-id="${data.message.id}"]`);
                    if (!existingMessage) {
                        // Add the completed message to the view
                        this.addCompletedMessageOptimized(data.message);
                    }
                    this.updateDiscussionInfoOptimized(data.message.discussionId);
                }
                this.loadDiscussions(); // Refresh list
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.message.discussionId) {
                    this.toastManager.show(`${data.message.modelName} completed response (${data.tokenCount || 0} tokens)`, 'success');
                }
                break;
            case 'round_completed':
                // Update discussion info to reflect new round
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`Round ${data.round} completed - next model starting!`, 'info');
                }
                break;
            case 'model_thinking':
                const runningInfo = data.runningModels && data.runningModels.length > 0 
                    ? ` (${data.runningModels.length} model running)` 
                    : '';
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`${data.modelName} is preparing response...${runningInfo}`, 'info');
                }
                break;
            case 'generating_summary':
                // Update discussion status to show it's generating summary
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                    // If modal is open and no summary exists yet, prepare for streaming
                    const existingSummary = document.querySelector('.discussion-summary');
                    if (!existingSummary) {
                        console.log('[DISCUSSION] Preparing for summary streaming...');
                    }
                }
                this.toastManager.show('Generating discussion summary...', 'info');
                break;
            case 'summary_started':
                // Add streaming summary placeholder
                this.addStreamingSummaryPlaceholderOptimized(data);
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`${data.summary.generatedBy} is generating summary...`, 'info');
                }
                break;
            case 'summary_token':
                // Handle real-time summary token streaming
                this.updateStreamingSummaryTokenOptimized(data);
                break;
            case 'summary_streaming':
                // Handle periodic summary content updates
                this.updateStreamingSummaryOptimized(data);
                break;
            case 'summary_complete':
                // Summary generation is complete
                this.completeStreamingSummaryOptimized(data);
                // Update download button visibility in modal if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDownloadButtonVisibility(data.discussionId);
                }
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`Summary completed (${data.tokenCount || 0} tokens)`, 'success');
                }
                break;
            case 'discussion_error':
                this.loadDiscussions();
                this.toastManager.show(`Discussion error: ${data.error}`, 'error');
                break;
            case 'discussion_deleted':
                this.loadDiscussions();
                // Close detail modal if this discussion is being viewed
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.closeModal('discussionDetailModal');
                }
                this.toastManager.show('Discussion was deleted', 'info');
                break;
            default:
                // For unknown types, do a light refresh
                this.loadDiscussions();
                break;
        }
    }

    /**
     * Optimized streaming message placeholder with reduced DOM operations
     */
    addStreamingMessagePlaceholderOptimized(message) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== message.discussionId) {
            return;
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        // Check if message already exists
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) return;
        
        // Create new message element using document fragment for better performance
        const fragment = document.createDocumentFragment();
        const messageElement = document.createElement('div');
        messageElement.className = 'message-item streaming';
        messageElement.setAttribute('data-message-id', message.id);
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-model">${message.modelName}</span>
                <span class="message-time">${this.formatDate(message.timestamp)}</span>
                ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                <span class="streaming-indicator">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    Responding...
                </span>
            </div>
            <div class="message-content" id="content-${message.id}">
                <span class="typing-cursor">|</span>
            </div>
            <div class="message-status" id="status-${message.id}">
                <span class="token-count">0 tokens</span>
            </div>
        `;
        
        fragment.appendChild(messageElement);
        
        // Remove "no messages" placeholder if it exists
        const noMessages = messagesContainer.querySelector('.no-messages');
        if (noMessages) {
            noMessages.remove();
        }
        
        // Insert message in correct order based on timestamp
        this.insertMessageInOrderOptimized(messagesContainer, fragment, message.timestamp);
        
        // Cache the message element
        this.messageCache.set(message.id, messageElement);
        
        // Scroll to bottom smoothly with throttling
        this.throttledScrollToBottom();
    }

    /**
     * Optimized token streaming update with reduced DOM operations
     */
    updateStreamingTokenOptimized(data) {
        // Only update if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        // Use cached element if available
        let contentElement = this.messageCache.get(data.messageId)?.querySelector(`#content-${data.messageId}`);
        if (!contentElement) {
            contentElement = document.getElementById(`content-${data.messageId}`);
        }
        
        const statusElement = document.getElementById(`status-${data.messageId}`);
        
        if (contentElement) {
            // Use requestAnimationFrame for smoother updates
            requestAnimationFrame(() => {
                // Remove typing cursor and add new content
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                
                // Update content with new token
                contentElement.innerHTML = data.fullContent + '<span class="typing-cursor">|</span>';
                
                // Update token count
                if (statusElement) {
                    statusElement.innerHTML = `<span class="token-count">${data.tokenCount} tokens</span>`;
                }
                
                // Auto-scroll to keep up with new content (throttled)
                this.throttledScrollToBottom();
            });
        }
    }

    /**
     * Throttled scroll to bottom to prevent excessive scrolling
     */
    throttledScrollToBottom() {
        if (this.scrollTimeout) return;
        
        this.scrollTimeout = setTimeout(() => {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            this.scrollTimeout = null;
        }, 100); // Throttle scrolling to every 100ms
    }

    /**
     * Optimized message insertion with better performance
     */
    insertMessageInOrderOptimized(container, messageElement, timestamp) {
        try {
            const existingMessages = container.querySelectorAll('.message-item');
            let inserted = false;
            
            // Use binary search for better performance with many messages
            if (existingMessages.length > 10) {
                // For large numbers of messages, append to end (most common case)
                container.appendChild(messageElement);
                inserted = true;
            } else {
                // For smaller numbers, use the existing logic
                for (let i = 0; i < existingMessages.length; i++) {
                    const existingMessage = existingMessages[i];
                    const existingTime = existingMessage.querySelector('.message-time');
                    
                    if (existingTime) {
                        try {
                            const existingTimestamp = new Date(existingTime.textContent);
                            const newTimestamp = new Date(timestamp);
                            
                            if (newTimestamp < existingTimestamp) {
                                container.insertBefore(messageElement, existingMessage);
                                inserted = true;
                                break;
                            }
                        } catch (timeError) {
                            console.warn('[DISCUSSION] Error parsing timestamp:', existingTime.textContent, timeError);
                            // Continue to next message if timestamp parsing fails
                        }
                    }
                }
            }
            
            // If not inserted yet, append to end
            if (!inserted) {
                container.appendChild(messageElement);
            }
            
        } catch (error) {
            console.error('[DISCUSSION] Error inserting message in order:', error);
            // Fallback: just append to end
            try {
                container.appendChild(messageElement);
            } catch (appendError) {
                console.error('[DISCUSSION] Failed to append message as fallback:', appendError);
            }
        }
    }

    /**
     * Optimized discussion info update with reduced API calls
     */
    async updateDiscussionInfoOptimized(discussionId) {
        // Throttle API calls to prevent excessive requests
        const now = Date.now();
        const lastUpdate = this.lastInfoUpdate || 0;
        if (now - lastUpdate < 1000) { // Minimum 1 second between updates
            return;
        }
        this.lastInfoUpdate = now;
        
        try {
            const response = await this.apiService.getDiscussion(discussionId);
            const discussion = response.data;
            
            // Update stored discussion
            this.currentViewingDiscussion = discussion;
            
            // Update discussion info section only (batch DOM updates)
            requestAnimationFrame(() => {
                this.updateDiscussionInfoDOM(discussion);
            });
            
        } catch (error) {
            console.error('[DISCUSSION] Failed to update discussion info:', error);
        }
    }

    /**
     * Update discussion info DOM elements in batch
     */
    updateDiscussionInfoDOM(discussion) {
        const infoSection = document.querySelector('.discussion-info .info-grid');
        if (infoSection) {
            infoSection.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Status</span>
                    <span class="info-value status-${discussion.status}">${discussion.status}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Models</span>
                    <span class="info-value">${discussion.models.join(', ')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Summary Model</span>
                    <span class="info-value">${discussion.summaryModel}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Max Rounds</span>
                    <span class="info-value">${discussion.maxRounds}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Current Round</span>
                    <span class="info-value">${discussion.currentRound}</span>
                </div>
                ${discussion.phase ? `
                <div class="info-item">
                    <span class="info-label">Discussion Phase</span>
                    <span class="info-value phase-${discussion.phase.name}">${discussion.phase.name.charAt(0).toUpperCase() + discussion.phase.name.slice(1)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Progress</span>
                    <span class="info-value">${discussion.phase.progress}%</span>
                </div>
                ` : ''}
                <div class="info-item">
                    <span class="info-label">Messages</span>
                    <span class="info-value">${discussion.messages ? discussion.messages.length : 0}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Created</span>
                    <span class="info-value">${this.formatDate(discussion.createdAt)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Updated</span>
                    <span class="info-value">${this.formatDate(discussion.updatedAt)}</span>
                </div>
            `;
        }
        
        // Update messages count in header
        const messagesHeader = document.querySelector('.discussion-messages h3');
        if (messagesHeader) {
            messagesHeader.textContent = `Messages (${discussion.messages ? discussion.messages.length : 0})`;
        }
    }

    /**
     * Start performance optimization tasks
     */
    startPerformanceOptimization() {
        // Clean up message cache periodically
        setInterval(() => {
            this.cleanupMessageCache();
        }, 300000); // Every 5 minutes
        
        // Monitor memory usage
        setInterval(() => {
            this.monitorMemoryUsage();
        }, 60000); // Every minute
        
        console.log('[PERFORMANCE] Client-side performance optimization started');
    }

    /**
     * Clean up message cache to prevent memory leaks
     */
    cleanupMessageCache() {
        const maxCacheSize = 100;
        if (this.messageCache.size > maxCacheSize) {
            const entries = Array.from(this.messageCache.entries());
            const toDelete = entries.slice(0, entries.length - maxCacheSize);
            toDelete.forEach(([key]) => this.messageCache.delete(key));
            console.log(`[PERFORMANCE] Cleaned ${toDelete.length} cached message elements`);
        }
    }

    /**
     * Monitor memory usage and log warnings
     */
    monitorMemoryUsage() {
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize;
            const total = performance.memory.totalJSHeapSize;
            const limit = performance.memory.jsHeapSizeLimit;
            
            const usagePercent = (used / limit) * 100;
            
            if (usagePercent > 80) {
                console.warn(`[PERFORMANCE] High memory usage: ${usagePercent.toFixed(1)}% (${Math.round(used / 1024 / 1024)}MB)`);
                
                // Force cleanup if memory usage is very high
                if (usagePercent > 90) {
                    this.forceCleanup();
                }
            }
        }
    }

    /**
     * Force cleanup of resources when memory usage is high
     */
    forceCleanup() {
        console.log('[PERFORMANCE] Forcing cleanup due to high memory usage');
        
        // Clear all caches
        this.messageCache.clear();
        this.updateQueue.clear();
        
        // Clear any pending timers
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
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
            console.log('[DISCUSSION] Loading available models from active provider...');
            const response = await this.apiService.getActiveProviderModels();
            
            // Handle the response structure properly
            let models = [];
            if (response && response.data) {
                models = response.data;
            } else if (Array.isArray(response)) {
                models = response;
            }
            
            this.availableModels = Array.isArray(models) ? models : [];
            console.log('[DISCUSSION] Loaded models:', this.availableModels);
            await this.populateModelSelections();
        } catch (error) {
            console.error('[DISCUSSION] Failed to load models:', error);
            this.toastManager.show('Failed to load available models from active provider', 'error');
            this.availableModels = [];
            await this.populateModelSelections(); // Still populate to show empty state
        }
    }

    async populateModelSelections() {
        const modelSelection = document.getElementById('modelSelection');
        const summaryModelSelect = document.getElementById('summaryModelSelect');
        
        if (!modelSelection || !summaryModelSelect) {
            console.warn('[DISCUSSION] Model selection elements not found');
            return;
        }

        // Clear existing content
        modelSelection.innerHTML = '';
        summaryModelSelect.innerHTML = '<option value="">Choose model for summary...</option>';

        if (this.availableModels.length === 0) {
            modelSelection.innerHTML = `
                <div class="no-models-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>No models available from the active provider. Please check your provider configuration or switch to a different provider.</p>
                    <a href="../models/models.html" class="btn btn-primary btn-sm">
                        <i class="fas fa-robot"></i>
                        Go to Models Page
                    </a>
                </div>
            `;
            return;
        }

        // Get favorites for sorting
        let favorites = [];
        try {
            const favoritesResponse = await this.apiService.getAllFavorites();
            // Handle the favorites response structure: {success: true, data: {ollama: [], openrouter: []}}
            if (favoritesResponse && favoritesResponse.success && favoritesResponse.data) {
                // Flatten all provider favorites into a single array
                const allFavorites = [];
                Object.values(favoritesResponse.data).forEach(providerFavorites => {
                    if (Array.isArray(providerFavorites)) {
                        providerFavorites.forEach(modelName => {
                            allFavorites.push({ modelName });
                        });
                    }
                });
                favorites = allFavorites;
            } else {
                favorites = [];
            }
        } catch (error) {
            console.warn('[DISCUSSION] Failed to load favorites:', error);
            favorites = []; // Ensure it's always an array
        }

        // Sort models with favorites first
        const sortedModels = [...this.availableModels].sort((a, b) => {
            const aIsFavorite = favorites.some(fav => fav.modelName === a.name);
            const bIsFavorite = favorites.some(fav => fav.modelName === b.name);
            
            if (aIsFavorite && !bIsFavorite) return -1;
            if (!aIsFavorite && bIsFavorite) return 1;
            return a.name.localeCompare(b.name);
        });

        // Populate model checkboxes
        sortedModels.forEach(model => {
            const isFavorite = favorites.some(fav => fav.modelName === model.name);
            const providerBadge = model.provider && model.provider !== 'ollama' ? 
                `<span class="provider-badge ${model.provider}">${model.provider.toUpperCase()}</span>` : '';
            const favoriteIndicator = isFavorite ? '⭐ ' : '';
            
            const checkbox = document.createElement('div');
            checkbox.className = 'model-checkbox';
            checkbox.innerHTML = `
                <input type="checkbox" id="model_${model.name}" name="models" value="${model.name}">
                <label for="model_${model.name}">
                    <span class="model-name">${favoriteIndicator}${model.name}</span>
                    ${providerBadge}
                    <span class="model-size">${this.formatSize(model.size)}</span>
                </label>
            `;
            
            const input = checkbox.querySelector('input');
            input.addEventListener('change', () => this.updateSelectedModels());
            
            modelSelection.appendChild(checkbox);
        });

        // Populate summary model select with favorites first
        sortedModels.forEach(model => {
            const isFavorite = favorites.some(fav => fav.modelName === model.name);
            const favoriteIndicator = isFavorite ? '⭐ ' : '';
            const providerIndicator = model.provider && model.provider !== 'ollama' ? 
                ` (${model.provider.toUpperCase()})` : '';
            
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = `${favoriteIndicator}${model.name}${providerIndicator}`;
            summaryModelSelect.appendChild(option);
        });
    }

    updateSelectedModels() {
        const checkboxes = document.querySelectorAll('#modelSelection input[type="checkbox"]:checked');
        this.selectedModels = Array.from(checkboxes).map(cb => cb.value);
        
        // Update UI feedback
        const modelCheckboxes = document.querySelectorAll('.model-checkbox');
        modelCheckboxes.forEach(checkbox => {
            const input = checkbox.querySelector('input');
            if (input.checked) {
                checkbox.classList.add('selected');
            } else {
                checkbox.classList.remove('selected');
            }
        });

        // Validate selection
        const createBtn = document.querySelector('button[form="newDiscussionForm"][type="submit"]');
        if (createBtn) {
            createBtn.disabled = this.selectedModels.length < 2;
        }

        console.log('[DISCUSSION] Selected models:', this.selectedModels);
    }

    formatSize(bytes) {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async loadDiscussions() {
        try {
            const discussionsResponse = await this.apiService.getDiscussions();
            
            // Extract data from API response structure
            const discussions = discussionsResponse.data || discussionsResponse || [];
            
            // Ensure discussions is an array
            const discussionsArray = Array.isArray(discussions) ? discussions : [];
            
            this.renderDiscussions(discussionsArray);
            this.updateStats(discussionsArray);
        } catch (error) {
            console.error('Failed to load discussions:', error);
            this.renderEmptyState();
        }
    }

    renderDiscussions(discussions) {
        const container = document.getElementById('discussionsList');
        if (!container) return;

        if (discussions.length === 0) {
            this.renderEmptyState();
            return;
        }

        container.innerHTML = discussions.map(discussion => `
            <div class="discussion-item" data-id="${discussion.id}">
                <div class="discussion-status ${discussion.status}"></div>
                <div class="discussion-content">
                    <div class="discussion-title">${discussion.topic}</div>
                    <div class="discussion-meta">
                        <span><i class="fas fa-robot"></i> ${discussion.models?.length || 0} models</span>
                        <span><i class="fas fa-comments"></i> ${discussion.messageCount || discussion.messages?.length || 0} messages</span>
                        <span><i class="fas fa-circle"></i> ${discussion.status}</span>
                        <span><i class="fas fa-clock"></i> ${this.formatDate(discussion.createdAt)}</span>
                    </div>
                    ${discussion.models ? `
                        <div class="discussion-models">
                            <strong>Models:</strong> ${discussion.models.join(', ')}
                        </div>
                    ` : ''}
                </div>
                <div class="discussion-actions">
                    <button class="btn btn-sm btn-secondary" onclick="window.discussionPageInstance.viewDiscussion('${discussion.id}')">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                    ${discussion.status === 'completed' ? `
                        <div class="download-dropdown">
                            <button class="btn btn-sm btn-primary download-btn" onclick="window.discussionPageInstance.toggleDownloadMenu('${discussion.id}')">
                                <i class="fas fa-download"></i>
                                Download
                                <i class="fas fa-chevron-down"></i>
                            </button>
                            <div class="download-menu" id="downloadMenu_${discussion.id}">
                                <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussion.id}', 'json')">
                                    <i class="fas fa-file-code"></i>
                                    JSON Format
                                </button>
                                <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussion.id}', 'txt')">
                                    <i class="fas fa-file-alt"></i>
                                    Text Format
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    ${discussion.status === 'created' ? `
                        <button class="btn btn-sm btn-success" onclick="window.discussionPageInstance.startDiscussion('${discussion.id}')">
                            <i class="fas fa-play"></i>
                            Start
                        </button>
                    ` : ''}
                    ${discussion.status === 'running' ? `
                        <button class="btn btn-sm btn-warning" onclick="window.discussionPageInstance.stopDiscussion('${discussion.id}')">
                            <i class="fas fa-stop"></i>
                            Stop
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="window.discussionPageInstance.deleteDiscussion('${discussion.id}')">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderEmptyState() {
        const container = document.getElementById('discussionsList');
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <h3>No discussions yet</h3>
                <p>Create your first discussion to get started</p>
            </div>
        `;
    }

    updateStats(discussions) {
        const total = discussions.length;
        const running = discussions.filter(d => d.status === 'running').length;
        const completed = discussions.filter(d => d.status === 'completed').length;
        const totalMessages = discussions.reduce((sum, d) => sum + (d.messageCount || d.messages?.length || 0), 0);

        this.updateStat('totalDiscussions', total);
        this.updateStat('runningDiscussions', running);
        this.updateStat('completedDiscussions', completed);
        this.updateStat('totalMessages', totalMessages);
    }

    async loadStorageInfo() {
        try {
            const response = await this.apiService.getStorageInfo();
            const storageInfo = response.data;
            
            // Update storage stats
            this.updateStat('storageSize', this.formatSize(storageInfo.storageSize));
            this.updateStat('backupCount', storageInfo.backupCount);
            
            // Update storage status
            const statusElement = document.getElementById('storageStatus');
            if (statusElement) {
                const icon = statusElement.querySelector('i');
                const text = statusElement.querySelector('span');
                
                let statusClass = 'healthy';
                let statusText = 'Healthy';
                
                if (storageInfo.storageSize > 50 * 1024 * 1024) { // 50MB
                    statusClass = 'warning';
                    statusText = 'Large Storage';
                } else if (storageInfo.backupCount > 10) {
                    statusClass = 'warning';
                    statusText = 'Many Backups';
                }
                
                statusElement.className = `status-indicator ${statusClass}`;
                text.textContent = statusText;
            }
            
            // Update storage details
            const detailsElement = document.getElementById('storageDetails');
            if (detailsElement) {
                detailsElement.innerHTML = `
                    <div class="storage-detail-item">
                        <h4>Total Discussions</h4>
                        <div class="detail-value">${storageInfo.totalDiscussions}</div>
                        <div class="detail-label">Stored in files</div>
                    </div>
                    <div class="storage-detail-item">
                        <h4>Active Discussions</h4>
                        <div class="detail-value">${storageInfo.activeDiscussions}</div>
                        <div class="detail-label">Currently running</div>
                    </div>
                    <div class="storage-detail-item">
                        <h4>Storage Size</h4>
                        <div class="detail-value">${this.formatSize(storageInfo.storageSize)}</div>
                        <div class="detail-label">Total disk usage</div>
                    </div>
                    <div class="storage-detail-item">
                        <h4>Backup Count</h4>
                        <div class="detail-value">${storageInfo.backupCount}</div>
                        <div class="detail-label">Available backups</div>
                    </div>
                    <div class="storage-detail-item">
                        <h4>Auto-Save Interval</h4>
                        <div class="detail-value">${storageInfo.storageConfig.autoSaveInterval / 1000}s</div>
                        <div class="detail-label">Active discussions</div>
                    </div>
                    <div class="storage-detail-item">
                        <h4>Storage Path</h4>
                        <div class="detail-value storage-path">${storageInfo.directories.discussions}</div>
                        <div class="detail-label">Local directory</div>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Failed to load storage info:', error);
            this.toastManager.show('Failed to load storage information', 'error');
            
            // Update status to show error
            const statusElement = document.getElementById('storageStatus');
            if (statusElement) {
                statusElement.className = 'status-indicator error';
                const text = statusElement.querySelector('span');
                if (text) text.textContent = 'Error';
            }
        }
    }

    async createBackup() {
        try {
            this.toastManager.show('Creating backup...', 'info');
            
            const response = await this.apiService.createBackup();
            console.log('Backup created:', response);
            
            this.toastManager.show('Backup created successfully!', 'success');
            
            // Refresh storage info to show new backup
            await this.loadStorageInfo();
            
        } catch (error) {
            console.error('Failed to create backup:', error);
            this.toastManager.show(`Failed to create backup: ${error.message}`, 'error');
        }
    }

    async cleanupStorage() {
        try {
            if (!confirm('This will remove old backups and orphaned files. Continue?')) {
                return;
            }
            
            this.toastManager.show('Cleaning up storage...', 'info');
            
            const response = await this.apiService.cleanupStorage();
            const result = response.data;
            
            let message = 'Storage cleanup completed';
            if (result.orphanedFilesRemoved > 0 || result.spaceSaved > 0) {
                message += ` - Removed ${result.orphanedFilesRemoved} files, saved ${this.formatSize(result.spaceSaved)}`;
            }
            
            this.toastManager.show(message, 'success');
            
            // Refresh storage info to show updated stats
            await this.loadStorageInfo();
            
        } catch (error) {
            console.error('Failed to cleanup storage:', error);
            this.toastManager.show(`Failed to cleanup storage: ${error.message}`, 'error');
        }
    }

    updateStat(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    setupEventListeners() {
        // New discussion button
        const newBtn = document.getElementById('newDiscussionBtn');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                this.showNewDiscussionModal();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadDiscussions();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.filterDiscussions();
            });
        }

        // New discussion form
        const newDiscussionForm = document.getElementById('newDiscussionForm');
        if (newDiscussionForm) {
            newDiscussionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createDiscussion();
            });
        }

        // Modal close handlers
        this.setupModalHandlers();

        // Storage management buttons
        const refreshStorageBtn = document.getElementById('refreshStorageBtn');
        if (refreshStorageBtn) {
            refreshStorageBtn.addEventListener('click', () => {
                this.loadStorageInfo();
            });
        }

        const createBackupBtn = document.getElementById('createBackupBtn');
        if (createBackupBtn) {
            createBackupBtn.addEventListener('click', () => {
                this.createBackup();
            });
        }

        const cleanupStorageBtn = document.getElementById('cleanupStorageBtn');
        if (cleanupStorageBtn) {
            cleanupStorageBtn.addEventListener('click', () => {
                this.cleanupStorage();
            });
        }
    }

    setupModalHandlers() {
        // Close modal only on close button click (removed clicking outside functionality)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.modal.show');
                if (openModal) {
                    this.closeModal(openModal.id);
                }
            }
        });
    }

    showNewDiscussionModal() {
        const modal = document.getElementById('newDiscussionModal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
            
            // Reset form
            const form = document.getElementById('newDiscussionForm');
            if (form) {
                form.reset();
                this.selectedModels = [];
                this.updateSelectedModels();
            }
            
            // Focus on topic input
            const topicInput = document.getElementById('discussionTopic');
            if (topicInput) {
                setTimeout(() => topicInput.focus(), 100);
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            
            // Clear current viewing discussion when closing detail modal
            if (modalId === 'discussionDetailModal') {
                console.log('[DISCUSSION] Closing detail modal, clearing current viewing discussion');
                
                // Close any open download menus
                document.querySelectorAll('.download-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
                
                // Unsubscribe from discussion updates
                if (this.wsService && this.wsService.isConnected) {
                    this.wsService.unsubscribeFromDiscussion();
                    console.log('[DISCUSSION] Unsubscribed from discussion updates');
                }
                
                this.currentViewingDiscussion = null;
                this.stopPeriodicSync();
            }
        }
    }

    async createDiscussion() {
        try {
            console.log('[DISCUSSION] Starting createDiscussion method');
            
            const topic = document.getElementById('discussionTopic')?.value?.trim();
            const summaryModel = document.getElementById('summaryModelSelect')?.value;
            const maxRounds = parseInt(document.getElementById('maxRoundsInput')?.value);
            
            console.log('[DISCUSSION] Form values:', { topic, summaryModel, maxRounds });

            // Check if form elements exist
            const topicElement = document.getElementById('discussionTopic');
            const summaryModelElement = document.getElementById('summaryModelSelect');
            const maxRoundsElement = document.getElementById('maxRoundsInput');
            
            if (!topicElement || !summaryModelElement || !maxRoundsElement) {
                console.error('[DISCUSSION] Form elements missing:', {
                    topicElement: !!topicElement,
                    summaryModelElement: !!summaryModelElement,
                    maxRoundsElement: !!maxRoundsElement
                });
                this.toastManager.show('Form is not properly initialized. Please try refreshing the page.', 'error');
                return;
            }

            // Validation
            if (!topic) {
                this.toastManager.show('Please enter a discussion topic', 'error');
                return;
            }

            if (this.selectedModels.length < 2) {
                this.toastManager.show('Please select at least 2 models for the discussion', 'error');
                return;
            }

            if (!summaryModel) {
                this.toastManager.show('Please select a model for generating the summary', 'error');
                return;
            }

            if (!maxRounds || maxRounds < 1 || maxRounds > 20) {
                this.toastManager.show('Maximum rounds must be between 1 and 20', 'error');
                return;
            }

            // Show loading state
            const submitBtn = document.querySelector('button[form="newDiscussionForm"][type="submit"]');
            if (!submitBtn) {
                console.error('[DISCUSSION] Submit button not found');
                this.toastManager.show('Form element not found. Please try refreshing the page.', 'error');
                return;
            }
            
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            console.log('[DISCUSSION] Creating discussion with:', {
                topic,
                models: this.selectedModels,
                summaryModel,
                maxRounds
            });

            // Create discussion
            const response = await this.apiService.createDiscussion({
                topic,
                models: this.selectedModels,
                summaryModel,
                maxRounds
            });

            console.log('[DISCUSSION] Discussion created:', response);

            this.toastManager.show('Discussion created successfully!', 'success');
            this.closeModal('newDiscussionModal');
            await this.loadDiscussions();

            // Ask if user wants to start the discussion immediately
            if (confirm('Discussion created! Would you like to start it now?')) {
                await this.startDiscussion(response.data.id);
            }

        } catch (error) {
            console.error('[DISCUSSION] Failed to create discussion:', error);
            this.toastManager.show(`Failed to create discussion: ${error.message}`, 'error');
        } finally {
            // Reset button state
            const submitBtn = document.querySelector('button[form="newDiscussionForm"][type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Create Discussion';
            }
        }
    }

    async startDiscussion(discussionId) {
        try {
            console.log('[DISCUSSION] Starting discussion:', discussionId);
            const response = await this.apiService.startDiscussion(discussionId);
            console.log('[DISCUSSION] Discussion started:', response);
            this.toastManager.show('Discussion started!', 'success');
            await this.loadDiscussions();
        } catch (error) {
            console.error('[DISCUSSION] Failed to start discussion:', error);
            this.toastManager.show(`Failed to start discussion: ${error.message}`, 'error');
        }
    }

    filterDiscussions() {
        const filter = document.getElementById('statusFilter').value;
        const discussionItems = document.querySelectorAll('.discussion-item');
        
        discussionItems.forEach(item => {
            const status = item.querySelector('.discussion-status').className.split(' ')[1];
            if (!filter || status === filter) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async stopDiscussion(discussionId) {
        try {
            if (!confirm('Are you sure you want to stop this discussion?')) {
                return;
            }
            
            console.log('[DISCUSSION] Stopping discussion:', discussionId);
            const response = await this.apiService.stopDiscussion(discussionId);
            console.log('[DISCUSSION] Discussion stopped:', response);
            this.toastManager.show('Discussion stopped', 'info');
            await this.loadDiscussions();
        } catch (error) {
            console.error('[DISCUSSION] Failed to stop discussion:', error);
            this.toastManager.show(`Failed to stop discussion: ${error.message}`, 'error');
        }
    }

    async deleteDiscussion(discussionId) {
        try {
            if (!confirm('Are you sure you want to delete this discussion? This action cannot be undone.')) {
                return;
            }
            
            console.log('[DISCUSSION] Deleting discussion:', discussionId);
            
            // First stop the discussion if it's running
            try {
                await this.apiService.stopDiscussion(discussionId);
                console.log('[DISCUSSION] Discussion stopped before deletion');
            } catch (stopError) {
                console.log('[DISCUSSION] Discussion was not running or already stopped');
            }
            
            // Then delete the discussion
            const response = await this.apiService.deleteDiscussion(discussionId);
            console.log('[DISCUSSION] Discussion deleted:', response);
            this.toastManager.show('Discussion stopped and deleted successfully', 'success');
            
            // Close detail modal if this discussion is being viewed
            if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === discussionId) {
                this.closeModal('discussionDetailModal');
            }
            
            await this.loadDiscussions();
        } catch (error) {
            console.error('[DISCUSSION] Failed to delete discussion:', error);
            this.toastManager.show(`Failed to delete discussion: ${error.message}`, 'error');
        }
    }

    async viewDiscussion(discussionId) {
        try {
            console.log('[DISCUSSION] Loading discussion details:', discussionId);
            const response = await this.apiService.getDiscussion(discussionId);
            const discussion = response.data;
            
            console.log('[DISCUSSION] Discussion loaded:', {
                id: discussion.id,
                status: discussion.status,
                messageCount: discussion.messageCount,
                hasMessages: discussion.messages ? discussion.messages.length : 0
            });
            
            this.showDiscussionDetail(discussion);
        } catch (error) {
            console.error('[DISCUSSION] Failed to load discussion:', error);
            this.toastManager.show(`Failed to load discussion: ${error.message}`, 'error');
        }
    }

    showDiscussionDetail(discussion) {
        const modal = document.getElementById('discussionDetailModal');
        const title = document.getElementById('discussionDetailTitle');
        const content = document.getElementById('discussionDetailContent');
        
        if (!modal || !title || !content) return;

        title.textContent = discussion.topic;
        
        // Store current discussion for real-time updates
        this.currentViewingDiscussion = discussion;
        
        // Subscribe to this discussion's updates via WebSocket
        if (this.wsService && this.wsService.isConnected) {
            this.wsService.subscribeToDiscussion(discussion.id);
            console.log('[DISCUSSION] Subscribed to discussion updates:', discussion.id);
        }
        
        // Start periodic sync for this discussion
        this.startPeriodicSync();
        
        content.innerHTML = `
            <div class="discussion-detail">
                <div class="discussion-info">
                    <div class="discussion-info-header">
                        <h3>Discussion Information</h3>
                        ${discussion.status === 'completed' ? `
                            <div class="download-dropdown">
                                <button class="btn btn-primary download-btn" onclick="window.discussionPageInstance.toggleDownloadMenu('modal_${discussion.id}')">
                                    <i class="fas fa-download"></i>
                                    Download Discussion
                                    <i class="fas fa-chevron-down"></i>
                                </button>
                                <div class="download-menu" id="downloadMenu_modal_${discussion.id}">
                                    <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussion.id}', 'json')">
                                        <i class="fas fa-file-code"></i>
                                        JSON Format
                                    </button>
                                    <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussion.id}', 'txt')">
                                        <i class="fas fa-file-alt"></i>
                                        Text Format
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Status</span>
                            <span class="info-value status-${discussion.status}">${discussion.status}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Models</span>
                            <span class="info-value">${discussion.models.join(', ')}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Summary Model</span>
                            <span class="info-value">${discussion.summaryModel}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Max Rounds</span>
                            <span class="info-value">${discussion.maxRounds}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Current Round</span>
                            <span class="info-value">${discussion.currentRound}</span>
                        </div>
                        ${discussion.phase ? `
                        <div class="info-item">
                            <span class="info-label">Discussion Phase</span>
                            <span class="info-value phase-${discussion.phase.name}">${discussion.phase.name.charAt(0).toUpperCase() + discussion.phase.name.slice(1)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Phase Description</span>
                            <span class="info-value">${discussion.phase.description}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Progress</span>
                            <span class="info-value">${discussion.phase.progress}%</span>
                        </div>
                        ` : ''}
                        <div class="info-item">
                            <span class="info-label">Messages</span>
                            <span class="info-value">${discussion.messages ? discussion.messages.length : 0}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Created</span>
                            <span class="info-value">${this.formatDate(discussion.createdAt)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Updated</span>
                            <span class="info-value">${this.formatDate(discussion.updatedAt)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="discussion-messages">
                    <h3>Messages (${discussion.messages ? discussion.messages.length : 0})</h3>
                    <div id="messagesContainer" class="messages-container">
                        ${(() => {
                            console.log('[DISCUSSION] Rendering messages for discussion:', discussion.id);
                            console.log('[DISCUSSION] Messages array:', discussion.messages);
                            console.log('[DISCUSSION] Messages count:', discussion.messages ? discussion.messages.length : 0);
                            
                            if (!discussion.messages || discussion.messages.length === 0) {
                                console.log('[DISCUSSION] No messages to display');
                                return '<p class="no-messages">No messages yet. Start the discussion to see the conversation.</p>';
                            }
                            
                            console.log('[DISCUSSION] Rendering', discussion.messages.length, 'messages');
                            return discussion.messages.map(message => {
                                console.log('[DISCUSSION] Rendering message:', message.id, message.modelName);
                                return `
                                    <div class="message-item" data-message-id="${message.id}">
                                        <div class="message-header">
                                            <span class="message-model">${message.modelName}</span>
                                            <span class="message-time">${this.formatDate(message.timestamp)}</span>
                                            ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                                        </div>
                                        <div class="message-content" id="content-${message.id}">${message.content}</div>
                                        <div class="message-status" id="status-${message.id}">
                                            <span class="completion-time">Completed at ${this.formatDate(message.timestamp)}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                </div>
                
                ${discussion.summary && !discussion.summary.streaming ? `
                    <div class="discussion-summary">
                        <h4>Discussion Summary</h4>
                        <div class="summary-meta">
                            <span>Generated by: ${discussion.summary.generatedBy}</span>
                            <span>Generated at: ${this.formatDate(discussion.summary.generatedAt)}</span>
                        </div>
                        <div class="summary-content-container">
                            <div class="summary-content">${discussion.summary.content}</div>
                        </div>
                        ${discussion.summary.tokenCount ? `
                            <div class="summary-status">
                                <span class="token-count">${discussion.summary.tokenCount} tokens</span>
                                <span class="completion-time">Completed at ${this.formatDate(discussion.summary.generatedAt)}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        modal.classList.add('show');
        modal.style.display = 'flex';
        
        // Sync any missing messages and scroll to bottom after modal is shown
        setTimeout(async () => {
            console.log('[DISCUSSION] Post-modal setup for discussion:', discussion.id);
            console.log('[DISCUSSION] Discussion has messages:', discussion.messages ? discussion.messages.length : 0);
            
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                console.log('[DISCUSSION] Messages container found, current content length:', messagesContainer.innerHTML.length);
                console.log('[DISCUSSION] Current DOM messages:', messagesContainer.querySelectorAll('.message-item').length);
                
                // If no messages are displayed but discussion has messages, force re-render
                if (discussion.messages && discussion.messages.length > 0 && messagesContainer.querySelectorAll('.message-item').length === 0) {
                    console.log('[DISCUSSION] Force re-rendering messages');
                    const messagesHtml = discussion.messages.map(message => `
                        <div class="message-item" data-message-id="${message.id}">
                            <div class="message-header">
                                <span class="message-model">${message.modelName}</span>
                                <span class="message-time">${this.formatDate(message.timestamp)}</span>
                                ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                            </div>
                            <div class="message-content" id="content-${message.id}">${message.content}</div>
                            <div class="message-status" id="status-${message.id}">
                                <span class="completion-time">Completed at ${this.formatDate(message.timestamp)}</span>
                            </div>
                        </div>
                    `).join('');
                    messagesContainer.innerHTML = messagesHtml;
                    console.log('[DISCUSSION] Re-rendered', discussion.messages.length, 'messages');
                }
                
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            // Add protection against message container being cleared (but only after initial render)
            this.protectMessagesContainer();
            
            // Sync any additional missing messages
            await this.syncMissingMessages();
            
            // If discussion is currently summarizing, add streaming summary placeholder
            if (discussion.status === 'summarizing' || (discussion.summary && discussion.summary.streaming)) {
                console.log('[DISCUSSION] Discussion is currently summarizing, adding streaming placeholder');
                this.addStreamingSummaryPlaceholderOptimized({
                    discussionId: discussion.id,
                    summary: discussion.summary || {
                        id: 'temp-summary-' + discussion.id,
                        generatedBy: discussion.summaryModel,
                        generatedAt: new Date(),
                        content: '',
                        streaming: true
                    }
                });
            }
        }, 200);
    }

    handleDiscussionUpdate(data) {
        // console.log('[DISCUSSION] Received update:', data);
        // console.log('[DISCUSSION] Current viewing discussion:', this.currentViewingDiscussion?.id);
        // console.log('[DISCUSSION] Modal open:', document.getElementById('discussionDetailModal')?.classList.contains('show'));
        
        // Handle different types of updates with optimized refresh strategy
        switch (data.type) {
            case 'discussion_completed':
                this.loadDiscussions();
                this.refreshCurrentDiscussionViewOptimized();
                // Update download button visibility in modal if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDownloadButtonVisibility(data.discussionId);
                }
                this.toastManager.show('Discussion completed!', 'success');
                break;
            case 'discussion_started':
                this.loadDiscussions();
                // Update current view if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                this.toastManager.show('Discussion started - watch models respond in real-time!', 'success');
                break;
            case 'discussion_stopped':
                this.loadDiscussions();
                // Update current view if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                this.toastManager.show('Discussion stopped', 'warning');
                break;
            case 'message_started':
                // Add new message placeholder for real-time streaming
                this.addStreamingMessagePlaceholderOptimized(data.message);
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.message.discussionId) {
                    this.toastManager.show(`${data.message.modelName} is responding...`, 'info');
                }
                break;
            case 'message_token':
                // Handle real-time token-by-token streaming with throttling
                this.updateStreamingTokenOptimized(data);
                break;
            case 'message_streaming':
                // Handle periodic full content updates
                this.updateStreamingMessageOptimized(data);
                break;
            case 'message_complete':
                // Message is complete, update final state
                this.completeStreamingMessageOptimized(data);
                // If viewing this discussion but message doesn't exist in DOM, add it
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.message.discussionId) {
                    const existingMessage = document.querySelector(`[data-message-id="${data.message.id}"]`);
                    if (!existingMessage) {
                        // Add the completed message to the view
                        this.addCompletedMessageOptimized(data.message);
                    }
                    this.updateDiscussionInfoOptimized(data.message.discussionId);
                }
                this.loadDiscussions(); // Refresh list
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.message.discussionId) {
                    this.toastManager.show(`${data.message.modelName} completed response (${data.tokenCount || 0} tokens)`, 'success');
                }
                break;
            case 'round_completed':
                // Update discussion info to reflect new round
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                }
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`Round ${data.round} completed - next model starting!`, 'info');
                }
                break;
            case 'model_thinking':
                const runningInfo = data.runningModels && data.runningModels.length > 0 
                    ? ` (${data.runningModels.length} model running)` 
                    : '';
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`${data.modelName} is preparing response...${runningInfo}`, 'info');
                }
                break;
            case 'generating_summary':
                // Update discussion status to show it's generating summary
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDiscussionInfoOptimized(data.discussionId);
                    // If modal is open and no summary exists yet, prepare for streaming
                    const existingSummary = document.querySelector('.discussion-summary');
                    if (!existingSummary) {
                        console.log('[DISCUSSION] Preparing for summary streaming...');
                    }
                }
                this.toastManager.show('Generating discussion summary...', 'info');
                break;
            case 'summary_started':
                // Add streaming summary placeholder
                this.addStreamingSummaryPlaceholderOptimized(data);
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`${data.summary.generatedBy} is generating summary...`, 'info');
                }
                break;
            case 'summary_token':
                // Handle real-time summary token streaming
                this.updateStreamingSummaryTokenOptimized(data);
                break;
            case 'summary_streaming':
                // Handle periodic summary content updates
                this.updateStreamingSummaryOptimized(data);
                break;
            case 'summary_complete':
                // Summary generation is complete
                this.completeStreamingSummaryOptimized(data);
                // Update download button visibility in modal if viewing this discussion
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.updateDownloadButtonVisibility(data.discussionId);
                }
                // Only show toast if not viewing the discussion detail
                if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
                    this.toastManager.show(`Summary completed (${data.tokenCount || 0} tokens)`, 'success');
                }
                break;
            case 'discussion_error':
                this.loadDiscussions();
                this.toastManager.show(`Discussion error: ${data.error}`, 'error');
                break;
            case 'discussion_deleted':
                this.loadDiscussions();
                // Close detail modal if this discussion is being viewed
                if (this.currentViewingDiscussion && this.currentViewingDiscussion.id === data.discussionId) {
                    this.closeModal('discussionDetailModal');
                }
                this.toastManager.show('Discussion was deleted', 'info');
                break;
            default:
                // For unknown types, do a light refresh
                this.loadDiscussions();
                break;
        }
    }

    addStreamingMessagePlaceholder(message) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== message.discussionId) {
            return;
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        // Check if message already exists
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) return;
        
        // Create new message element
        const messageElement = document.createElement('div');
        messageElement.className = 'message-item streaming';
        messageElement.setAttribute('data-message-id', message.id);
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-model">${message.modelName}</span>
                <span class="message-time">${this.formatDate(message.timestamp)}</span>
                ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                <span class="streaming-indicator">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    Responding...
                </span>
            </div>
            <div class="message-content" id="content-${message.id}">
                <span class="typing-cursor">|</span>
            </div>
            <div class="message-status" id="status-${message.id}">
                <span class="token-count">0 tokens</span>
            </div>
        `;
        
        // Remove "no messages" placeholder if it exists
        const noMessages = messagesContainer.querySelector('.no-messages');
        if (noMessages) {
            noMessages.remove();
        }
        
        // Insert message in correct order based on timestamp
        this.insertMessageInOrderOptimized(messagesContainer, messageElement, message.timestamp);
        
        // Scroll to bottom smoothly
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    addCompletedMessage(message) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== message.discussionId) {
            console.log('[DISCUSSION] Skipping message add - not viewing correct discussion');
            return;
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) {
            console.warn('[DISCUSSION] Messages container not found when adding message');
            return;
        }
        
        // Check if message already exists
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) {
            console.log('[DISCUSSION] Message already exists, skipping:', message.id);
            return;
        }
        
        console.log('[DISCUSSION] Adding completed message to view:', message.id, message.modelName);
        
        try {
            // Create new message element for completed message
            const messageElement = document.createElement('div');
            messageElement.className = 'message-item';
            messageElement.setAttribute('data-message-id', message.id);
            
            // Safely handle message content
            const safeContent = message.content || '';
            const safeModelName = message.modelName || 'Unknown Model';
            const safeTimestamp = message.timestamp || new Date().toISOString();
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-model">${safeModelName}</span>
                    <span class="message-time">${this.formatDate(safeTimestamp)}</span>
                    ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                </div>
                <div class="message-content" id="content-${message.id}">${safeContent}</div>
                <div class="message-status" id="status-${message.id}">
                    <span class="completion-time">Completed at ${this.formatDate(safeTimestamp)}</span>
                </div>
            `;
            
            // Remove "no messages" placeholder if it exists
            const noMessages = messagesContainer.querySelector('.no-messages');
            if (noMessages) {
                noMessages.remove();
            }
            
            // Insert message in correct order based on timestamp
            this.insertMessageInOrderOptimized(messagesContainer, messageElement, safeTimestamp);
            
            // Scroll to bottom smoothly
            setTimeout(() => {
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }, 100);
            
        } catch (error) {
            console.error('[DISCUSSION] Error adding completed message:', error, message);
        }
    }

    insertMessageInOrder(container, messageElement, timestamp) {
        try {
            const existingMessages = container.querySelectorAll('.message-item');
            let inserted = false;
            
            for (let i = 0; i < existingMessages.length; i++) {
                const existingMessage = existingMessages[i];
                const existingTime = existingMessage.querySelector('.message-time');
                
                if (existingTime) {
                    try {
                        const existingTimestamp = new Date(existingTime.textContent);
                        const newTimestamp = new Date(timestamp);
                        
                        if (newTimestamp < existingTimestamp) {
                            container.insertBefore(messageElement, existingMessage);
                            inserted = true;
                            break;
                        }
                    } catch (timeError) {
                        console.warn('[DISCUSSION] Error parsing timestamp:', existingTime.textContent, timeError);
                        // Continue to next message if timestamp parsing fails
                    }
                }
            }
            
            // If not inserted yet, append to end
            if (!inserted) {
                container.appendChild(messageElement);
            }
            
        } catch (error) {
            console.error('[DISCUSSION] Error inserting message in order:', error);
            // Fallback: just append to end
            try {
                container.appendChild(messageElement);
            } catch (appendError) {
                console.error('[DISCUSSION] Failed to append message as fallback:', appendError);
            }
        }
    }

    updateStreamingToken(data) {
        // Only update if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        const contentElement = document.getElementById(`content-${data.messageId}`);
        const statusElement = document.getElementById(`status-${data.messageId}`);
        
        if (contentElement) {
            // Remove typing cursor and add new content
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            
            // Update content with new token
            contentElement.innerHTML = data.fullContent + '<span class="typing-cursor">|</span>';
            
            // Update token count
            if (statusElement) {
                statusElement.innerHTML = `<span class="token-count">${data.tokenCount} tokens</span>`;
            }
            
            // Auto-scroll to keep up with new content
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                // Use requestAnimationFrame for smoother scrolling
                requestAnimationFrame(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                });
            }
        }
    }

    updateStreamingMessage(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        // Periodic full content update for consistency
        const contentElement = document.getElementById(`content-${data.messageId}`);
        if (contentElement && data.content) {
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            
            contentElement.innerHTML = data.content + (data.isComplete ? '' : '<span class="typing-cursor">|</span>');
        }
    }

    completeStreamingMessage(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        const messageElement = document.querySelector(`[data-message-id="${data.message.id}"]`);
        const contentElement = document.getElementById(`content-${data.message.id}`);
        const statusElement = document.getElementById(`status-${data.message.id}`);
        
        if (messageElement) {
            // Remove streaming class and indicator
            messageElement.classList.remove('streaming');
            const streamingIndicator = messageElement.querySelector('.streaming-indicator');
            if (streamingIndicator) streamingIndicator.remove();
        }
        
        if (contentElement) {
            // Remove typing cursor and set final content
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            contentElement.innerHTML = data.message.content;
        }
        
        if (statusElement) {
            statusElement.innerHTML = `
                <span class="token-count">${data.tokenCount || 0} tokens</span>
                <span class="completion-time">Completed at ${this.formatDate(new Date())}</span>
            `;
        }
    }

    refreshCurrentDiscussionView() {
        // Refresh the discussion detail view if it's open
        if (this.currentViewingDiscussion) {
            // Always refresh discussion info, but be careful with messages during streaming
            const hasStreamingMessages = document.querySelector('.message-item.streaming');
            if (!hasStreamingMessages) {
                // Full refresh when not streaming - but preserve modal state
                this.viewDiscussion(this.currentViewingDiscussion.id);
            } else {
                // Light refresh - only update discussion info, not messages
                this.updateDiscussionInfo(this.currentViewingDiscussion.id);
            }
        }
    }

    // Method to sync missing messages when modal is opened
    async syncMissingMessages() {
        if (!this.currentViewingDiscussion) {
            console.log('[DISCUSSION] No current viewing discussion, skipping sync');
            return;
        }
        
        try {
            const response = await this.apiService.getDiscussion(this.currentViewingDiscussion.id);
            if (!response || !response.data) {
                console.warn('[DISCUSSION] Invalid response from API:', response);
                return;
            }
            
            const discussion = response.data;
            
            // Check for messages that exist in the API but not in the DOM
            const messagesContainer = document.getElementById('messagesContainer');
            if (!messagesContainer) {
                console.warn('[DISCUSSION] Messages container not found');
                return;
            }
            
            const currentDOMMessages = messagesContainer.querySelectorAll('.message-item').length;
            const apiMessageCount = discussion.messages ? discussion.messages.length : 0;
            
            // Only log if there's a mismatch
            if (currentDOMMessages !== apiMessageCount) {
                console.log(`[DISCUSSION] Message count mismatch - DOM: ${currentDOMMessages}, API: ${apiMessageCount}`);
            }
            
            let addedNewMessages = false;
            if (discussion.messages && Array.isArray(discussion.messages)) {
                discussion.messages.forEach(message => {
                    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
                    if (!existingMessage) {
                        console.log('[DISCUSSION] Adding missing message to view:', message.id, message.modelName);
                        this.addCompletedMessage(message);
                        addedNewMessages = true;
                    }
                });
            }
            
            // Update the stored discussion
            this.currentViewingDiscussion = discussion;
            
            if (addedNewMessages) {
                const newDOMMessages = messagesContainer.querySelectorAll('.message-item').length;
                console.log(`[DISCUSSION] Added new messages, DOM count: ${currentDOMMessages} -> ${newDOMMessages}`);
            }
            
        } catch (error) {
            console.error('[DISCUSSION] Failed to sync missing messages:', error);
        }
    }

    // Gentle refresh - only add missing messages without clearing existing ones
    async gentleRefreshMessages() {
        if (!this.currentViewingDiscussion) return;
        
        try {
            const response = await this.apiService.getDiscussion(this.currentViewingDiscussion.id);
            const discussion = response.data;
            
            const messagesContainer = document.getElementById('messagesContainer');
            if (!messagesContainer) return;
            
            // Only add missing messages, don't clear anything
            let addedCount = 0;
            if (discussion.messages && Array.isArray(discussion.messages)) {
                discussion.messages.forEach(message => {
                    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
                    if (!existingMessage) {
                        this.addCompletedMessage(message);
                        addedCount++;
                    }
                });
            }
            
            // Update the stored discussion
            this.currentViewingDiscussion = discussion;
            
            if (addedCount > 0) {
                console.log('[DISCUSSION] Gentle refresh added', addedCount, 'missing messages');
            }
            
        } catch (error) {
            console.error('[DISCUSSION] Failed to gentle refresh messages:', error);
        }
    }

    // Protect messages container from being accidentally cleared
    protectMessagesContainer() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            // Add a data attribute to mark it as protected
            messagesContainer.setAttribute('data-protected', 'true');
            
            // Override innerHTML setter to prevent accidental clearing, but allow legitimate content
            const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
            if (originalInnerHTML && !messagesContainer.hasOwnProperty('innerHTML')) {
                Object.defineProperty(messagesContainer, 'innerHTML', {
                    set: function(value) {
                        // Only prevent clearing if there are existing messages and the new value is empty
                        const currentMessages = this.querySelectorAll('.message-item').length;
                        if ((value === '' || value === null) && currentMessages > 0) {
                            console.warn('[DISCUSSION] Prevented clearing of protected messages container with', currentMessages, 'messages');
                            return;
                        }
                        originalInnerHTML.set.call(this, value);
                    },
                    get: originalInnerHTML.get,
                    configurable: true
                });
            }
            
            console.log('[DISCUSSION] Messages container protected from accidental clearing');
        }
    }

    startPeriodicSync() {
        // Clear any existing interval
        this.stopPeriodicSync();
        
        // Start new interval to sync every 2 seconds when modal is open
        this.syncInterval = setInterval(async () => {
            if (this.currentViewingDiscussion && document.getElementById('discussionDetailModal').classList.contains('show')) {
                // Only use gentle sync to avoid clearing messages
                await this.syncMissingMessages();
            } else {
                // Stop syncing if modal is closed
                this.stopPeriodicSync();
            }
        }, 2000); // Back to 2 seconds to reduce API calls
        
        console.log('[DISCUSSION] Started periodic sync for discussion:', this.currentViewingDiscussion?.id);
    }

    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[DISCUSSION] Stopped periodic sync');
        }
    }

    async updateDiscussionInfo(discussionId) {
        try {
            const response = await this.apiService.getDiscussion(discussionId);
            const discussion = response.data;
            
            // Update stored discussion
            this.currentViewingDiscussion = discussion;
            
            // Update discussion info section only
            const infoSection = document.querySelector('.discussion-info .info-grid');
            if (infoSection) {
                infoSection.innerHTML = `
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="info-value status-${discussion.status}">${discussion.status}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Models</span>
                        <span class="info-value">${discussion.models.join(', ')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Summary Model</span>
                        <span class="info-value">${discussion.summaryModel}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Max Rounds</span>
                        <span class="info-value">${discussion.maxRounds}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Current Round</span>
                        <span class="info-value">${discussion.currentRound}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Messages</span>
                        <span class="info-value">${discussion.messages ? discussion.messages.length : 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Created</span>
                        <span class="info-value">${this.formatDate(discussion.createdAt)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Updated</span>
                        <span class="info-value">${this.formatDate(discussion.updatedAt)}</span>
                    </div>
                `;
            }
            
            // Update messages count in header
            const messagesHeader = document.querySelector('.discussion-messages h3');
            if (messagesHeader) {
                messagesHeader.textContent = `Messages (${discussion.messages ? discussion.messages.length : 0})`;
            }
            
            // Check for any missing messages and add them
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer && discussion.messages && Array.isArray(discussion.messages)) {
                discussion.messages.forEach(message => {
                    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
                    if (!existingMessage) {
                        console.log('[DISCUSSION] Adding missing message during info update:', message);
                        this.addCompletedMessage(message);
                    }
                });
            }
            
            // Update summary if available and not already shown
            if (discussion.summary && !discussion.summary.streaming) {
                const detailContent = document.getElementById('discussionDetailContent');
                if (detailContent) {
                    const summaryHtml = `
                        <div class="discussion-summary">
                            <h4>Discussion Summary</h4>
                            <div class="summary-meta">
                                <span>Generated by: ${discussion.summary.generatedBy}</span>
                                <span>Generated at: ${this.formatDate(discussion.summary.generatedAt)}</span>
                            </div>
                            <div class="summary-content-container">
                                <div class="summary-content">${discussion.summary.content}</div>
                            </div>
                            ${discussion.summary.tokenCount ? `
                                <div class="summary-status">
                                    <span class="token-count">${discussion.summary.tokenCount} tokens</span>
                                    <span class="completion-time">Completed at ${this.formatDate(discussion.summary.generatedAt)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                    detailContent.insertAdjacentHTML('beforeend', summaryHtml);
                }
            }
            
            // Update download button visibility if discussion is completed
            if (discussion.status === 'completed') {
                this.updateDownloadButtonVisibility(discussionId);
            }
        } catch (error) {
            console.error('[DISCUSSION] Failed to update discussion info:', error);
        }
    }

    toggleDownloadMenu(discussionId) {
        // Close all other download menus first
        document.querySelectorAll('.download-menu').forEach(menu => {
            if (menu.id !== `downloadMenu_${discussionId}`) {
                menu.classList.remove('show');
            }
        });

        // Toggle the clicked menu
        const menu = document.getElementById(`downloadMenu_${discussionId}`);
        if (menu) {
            menu.classList.toggle('show');
        }

        // Close menu when clicking outside
        const closeMenus = (e) => {
            if (!e.target.closest('.download-dropdown')) {
                document.querySelectorAll('.download-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
                document.removeEventListener('click', closeMenus);
            }
        };

        if (menu && menu.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', closeMenus);
            }, 100);
        }
    }

    async downloadDiscussion(discussionId, format) {
        try {
            console.log(`[DISCUSSION] Downloading discussion ${discussionId} in ${format} format`);
            
            // Close the download menu
            const menu = document.getElementById(`downloadMenu_${discussionId}`);
            if (menu) {
                menu.classList.remove('show');
            }

            // Show loading state
            this.toastManager.show(`Preparing ${format.toUpperCase()} download...`, 'info');

            // Download the discussion
            const result = await this.apiService.downloadDiscussion(discussionId, format);
            
            console.log('[DISCUSSION] Download completed:', result);
            this.toastManager.show(`Discussion downloaded successfully as ${result.filename}`, 'success');
            
        } catch (error) {
            console.error('[DISCUSSION] Download failed:', error);
            this.toastManager.show(`Download failed: ${error.message}`, 'error');
        }
    }

    addStreamingSummaryPlaceholder(data) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
            console.log('[DISCUSSION] Not adding summary placeholder - not viewing correct discussion');
            return;
        }
        
        const detailContent = document.getElementById('discussionDetailContent');
        if (!detailContent) {
            console.warn('[DISCUSSION] Detail content not found for summary placeholder');
            return;
        }
        
        // Check if summary already exists
        const existingSummary = document.querySelector('.discussion-summary');
        if (existingSummary) {
            console.log('[DISCUSSION] Summary already exists, not adding placeholder');
            return;
        }
        
        console.log('[DISCUSSION] Adding streaming summary placeholder for:', data.summary.generatedBy);
        
        // Get existing content if summary is already in progress
        const existingContent = data.summary.content || '';
        const tokenCount = existingContent.split(' ').filter(word => word.length > 0).length;
        
        // Create streaming summary element
        const summaryElement = document.createElement('div');
        summaryElement.className = 'discussion-summary streaming';
        summaryElement.innerHTML = `
            <div class="summary-header">
                <h4>Discussion Summary</h4>
                <span class="streaming-indicator">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    Generating...
                </span>
            </div>
            <div class="summary-meta">
                <span>Generated by: ${data.summary.generatedBy}</span>
                <span>Started at: ${this.formatDate(data.summary.generatedAt)}</span>
            </div>
            <div class="summary-content-container" id="summary-container-${data.summary.id}">
                <div class="summary-content" id="summary-content-${data.summary.id}">
                    ${existingContent}<span class="typing-cursor">|</span>
                </div>
            </div>
            <div class="summary-status" id="summary-status-${data.summary.id}">
                <span class="token-count">${tokenCount} tokens</span>
            </div>
        `;
        
        detailContent.appendChild(summaryElement);
        
        // Scroll to show the summary and auto-scroll to bottom if there's existing content
        setTimeout(() => {
            summaryElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
            
            // If there's existing content, scroll the container to bottom
            if (existingContent) {
                const containerElement = document.getElementById(`summary-container-${data.summary.id}`);
                if (containerElement) {
                    containerElement.scrollTop = containerElement.scrollHeight;
                }
            }
        }, 100);
    }

    updateStreamingSummaryToken(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        console.log('[DISCUSSION] Updating summary token, length:', data.fullContent?.length || 0);
        
        const contentElement = document.getElementById(`summary-content-${data.summaryId}`);
        const containerElement = document.getElementById(`summary-container-${data.summaryId}`);
        const statusElement = document.getElementById(`summary-status-${data.summaryId}`);
        
        if (contentElement) {
            // Remove typing cursor and add new content
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            
            // Update content with new token
            contentElement.innerHTML = data.fullContent + '<span class="typing-cursor">|</span>';
            
            // Update token count
            if (statusElement) {
                statusElement.innerHTML = `<span class="token-count">${data.tokenCount} tokens</span>`;
            }
            
            // Auto-scroll the summary container to bottom to show new content
            if (containerElement) {
                requestAnimationFrame(() => {
                    containerElement.scrollTop = containerElement.scrollHeight;
                });
            }
        } else {
            console.warn('[DISCUSSION] Summary content element not found:', `summary-content-${data.summaryId}`);
        }
    }

    updateStreamingSummary(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        // Periodic full content update for consistency
        const contentElement = document.getElementById(`summary-content-${data.summaryId}`);
        const containerElement = document.getElementById(`summary-container-${data.summaryId}`);
        
        if (contentElement && data.content) {
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            
            contentElement.innerHTML = data.content + (data.isComplete ? '' : '<span class="typing-cursor">|</span>');
            
            // Auto-scroll the summary container to bottom
            if (containerElement) {
                requestAnimationFrame(() => {
                    containerElement.scrollTop = containerElement.scrollHeight;
                });
            }
        }
    }

    completeStreamingSummary(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        console.log('[DISCUSSION] Completing streaming summary for:', data.summary.generatedBy);
        
        const summaryElement = document.querySelector('.discussion-summary.streaming');
        const contentElement = document.getElementById(`summary-content-${data.summary.id}`);
        const containerElement = document.getElementById(`summary-container-${data.summary.id}`);
        const statusElement = document.getElementById(`summary-status-${data.summary.id}`);
        
        if (summaryElement) {
            // Remove streaming class and indicator
            summaryElement.classList.remove('streaming');
            const streamingIndicator = summaryElement.querySelector('.streaming-indicator');
            if (streamingIndicator) streamingIndicator.remove();
        }
        
        if (contentElement) {
            // Remove typing cursor and set final content
            const cursor = contentElement.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
            contentElement.innerHTML = data.summary.content;
            
            // Final scroll to ensure all content is visible
            if (containerElement) {
                setTimeout(() => {
                    containerElement.scrollTop = containerElement.scrollHeight;
                }, 100);
            }
        }
        
        if (statusElement) {
            statusElement.innerHTML = `
                <span class="token-count">${data.tokenCount || 0} tokens</span>
                <span class="completion-time">Completed at ${this.formatDate(new Date())}</span>
            `;
        }
        
        // Update the summary meta to show completion time
        const summaryMeta = summaryElement?.querySelector('.summary-meta');
        if (summaryMeta) {
            summaryMeta.innerHTML = `
                <span>Generated by: ${data.summary.generatedBy}</span>
                <span>Generated at: ${this.formatDate(data.summary.generatedAt)}</span>
            `;
        }
        
        // Update the current viewing discussion to mark it as completed
        if (this.currentViewingDiscussion) {
            this.currentViewingDiscussion.status = 'completed';
            this.currentViewingDiscussion.summary = data.summary;
        }
        
        // Immediately update download button visibility
        setTimeout(() => {
            this.updateDownloadButtonVisibility(data.discussionId);
            console.log('[DISCUSSION] Download button updated after summary completion');
        }, 100);
        
        // Refresh the discussion list to show updated status
        this.loadDiscussions();
    }

    updateDownloadButtonVisibility(discussionId) {
        // Update download button in the discussion info header if it exists
        const infoHeader = document.querySelector('.discussion-info-header');
        if (infoHeader) {
            // Check if download button already exists
            const existingDownload = infoHeader.querySelector('.download-dropdown');
            if (!existingDownload) {
                // Add download button to the modal header
                const downloadHtml = `
                    <div class="download-dropdown">
                        <button class="btn btn-primary download-btn" onclick="window.discussionPageInstance.toggleDownloadMenu('modal_${discussionId}')">
                            <i class="fas fa-download"></i>
                            Download Discussion
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="download-menu" id="downloadMenu_modal_${discussionId}">
                            <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussionId}', 'json')">
                                <i class="fas fa-file-code"></i>
                                JSON Format
                            </button>
                            <button class="download-option" onclick="window.discussionPageInstance.downloadDiscussion('${discussionId}', 'txt')">
                                <i class="fas fa-file-alt"></i>
                                Text Format
                            </button>
                        </div>
                    </div>
                `;
                infoHeader.insertAdjacentHTML('beforeend', downloadHtml);
                console.log('[DISCUSSION] Download button added to modal after completion');
            }
        }
        
        // Also update the discussion status in the info grid
        const statusValue = document.querySelector('.info-grid .info-item .info-value.status-summarizing, .info-grid .info-item .info-value.status-running');
        if (statusValue) {
            statusValue.className = 'info-value status-completed';
            statusValue.textContent = 'completed';
            console.log('[DISCUSSION] Discussion status updated to completed in modal');
        }
    }

    /**
     * Optimized current discussion view refresh
     */
    refreshCurrentDiscussionViewOptimized() {
        // Refresh the discussion detail view if it's open
        if (this.currentViewingDiscussion) {
            // Always refresh discussion info, but be careful with messages during streaming
            const hasStreamingMessages = document.querySelector('.message-item.streaming');
            if (!hasStreamingMessages) {
                // Full refresh when not streaming - but preserve modal state
                this.viewDiscussion(this.currentViewingDiscussion.id);
            } else {
                // Light refresh - only update discussion info, not messages
                this.updateDiscussionInfoOptimized(this.currentViewingDiscussion.id);
            }
        }
    }

    /**
     * Optimized streaming message update
     */
    updateStreamingMessageOptimized(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        // Periodic full content update for consistency
        const contentElement = document.getElementById(`content-${data.messageId}`);
        if (contentElement && data.content) {
            requestAnimationFrame(() => {
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                
                contentElement.innerHTML = data.content + (data.isComplete ? '' : '<span class="typing-cursor">|</span>');
            });
        }
    }

    /**
     * Optimized streaming message completion
     */
    completeStreamingMessageOptimized(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        const messageElement = document.querySelector(`[data-message-id="${data.message.id}"]`);
        const contentElement = document.getElementById(`content-${data.message.id}`);
        const statusElement = document.getElementById(`status-${data.message.id}`);
        
        requestAnimationFrame(() => {
            if (messageElement) {
                // Remove streaming class and indicator
                messageElement.classList.remove('streaming');
                const streamingIndicator = messageElement.querySelector('.streaming-indicator');
                if (streamingIndicator) streamingIndicator.remove();
            }
            
            if (contentElement) {
                // Remove typing cursor and set final content
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                contentElement.innerHTML = data.message.content;
            }
            
            if (statusElement) {
                statusElement.innerHTML = `
                    <span class="token-count">${data.tokenCount || 0} tokens</span>
                    <span class="completion-time">Completed at ${this.formatDate(new Date())}</span>
                `;
            }
        });
    }

    /**
     * Optimized completed message addition
     */
    addCompletedMessageOptimized(message) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== message.discussionId) {
            return;
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) {
            return;
        }
        
        // Check if message already exists
        const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existingMessage) {
            return;
        }
        
        try {
            // Create new message element for completed message using fragment
            const fragment = document.createDocumentFragment();
            const messageElement = document.createElement('div');
            messageElement.className = 'message-item';
            messageElement.setAttribute('data-message-id', message.id);
            
            // Safely handle message content
            const safeContent = message.content || '';
            const safeModelName = message.modelName || 'Unknown Model';
            const safeTimestamp = message.timestamp || new Date().toISOString();
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-model">${safeModelName}</span>
                    <span class="message-time">${this.formatDate(safeTimestamp)}</span>
                    ${message.round ? `<span class="message-round">Round ${message.round}</span>` : ''}
                </div>
                <div class="message-content" id="content-${message.id}">${safeContent}</div>
                <div class="message-status" id="status-${message.id}">
                    <span class="completion-time">Completed at ${this.formatDate(safeTimestamp)}</span>
                </div>
            `;
            
            fragment.appendChild(messageElement);
            
            // Remove "no messages" placeholder if it exists
            const noMessages = messagesContainer.querySelector('.no-messages');
            if (noMessages) {
                noMessages.remove();
            }
            
            // Insert message in correct order based on timestamp
            this.insertMessageInOrderOptimized(messagesContainer, fragment, safeTimestamp);
            
            // Cache the message element
            this.messageCache.set(message.id, messageElement);
            
            // Scroll to bottom smoothly
            this.throttledScrollToBottom();
            
        } catch (error) {
            console.error('[DISCUSSION] Error adding completed message:', error, message);
        }
    }

    /**
     * Optimized summary placeholder addition
     */
    addStreamingSummaryPlaceholderOptimized(data) {
        // Only add if we're viewing the discussion detail modal and it's the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) {
            return;
        }
        
        const detailContent = document.getElementById('discussionDetailContent');
        if (!detailContent) {
            return;
        }
        
        // Check if summary already exists
        const existingSummary = document.querySelector('.discussion-summary');
        if (existingSummary) {
            return;
        }
        
        // Get existing content if summary is already in progress
        const existingContent = data.summary.content || '';
        const tokenCount = existingContent.split(' ').filter(word => word.length > 0).length;
        
        // Create streaming summary element using fragment
        const fragment = document.createDocumentFragment();
        const summaryElement = document.createElement('div');
        summaryElement.className = 'discussion-summary streaming';
        summaryElement.innerHTML = `
            <div class="summary-header">
                <h4>Discussion Summary</h4>
                <span class="streaming-indicator">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    Generating...
                </span>
            </div>
            <div class="summary-meta">
                <span>Generated by: ${data.summary.generatedBy}</span>
                <span>Started at: ${this.formatDate(data.summary.generatedAt)}</span>
            </div>
            <div class="summary-content-container" id="summary-container-${data.summary.id}">
                <div class="summary-content" id="summary-content-${data.summary.id}">
                    ${existingContent}<span class="typing-cursor">|</span>
                </div>
            </div>
            <div class="summary-status" id="summary-status-${data.summary.id}">
                <span class="token-count">${tokenCount} tokens</span>
            </div>
        `;
        
        fragment.appendChild(summaryElement);
        detailContent.appendChild(fragment);
        
        // Scroll to show the summary
        setTimeout(() => {
            summaryElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
    }

    /**
     * Optimized summary token streaming update
     */
    updateStreamingSummaryTokenOptimized(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        const contentElement = document.getElementById(`summary-content-${data.summaryId}`);
        const containerElement = document.getElementById(`summary-container-${data.summaryId}`);
        const statusElement = document.getElementById(`summary-status-${data.summaryId}`);
        
        if (contentElement) {
            requestAnimationFrame(() => {
                // Remove typing cursor and add new content
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                
                // Update content with new token
                contentElement.innerHTML = data.fullContent + '<span class="typing-cursor">|</span>';
                
                // Update token count
                if (statusElement) {
                    statusElement.innerHTML = `<span class="token-count">${data.tokenCount} tokens</span>`;
                }
                
                // Auto-scroll the summary container to bottom to show new content
                if (containerElement) {
                    containerElement.scrollTop = containerElement.scrollHeight;
                }
            });
        }
    }

    /**
     * Optimized summary streaming update
     */
    updateStreamingSummaryOptimized(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        // Periodic full content update for consistency
        const contentElement = document.getElementById(`summary-content-${data.summaryId}`);
        const containerElement = document.getElementById(`summary-container-${data.summaryId}`);
        
        if (contentElement && data.content) {
            requestAnimationFrame(() => {
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                
                contentElement.innerHTML = data.content + (data.isComplete ? '' : '<span class="typing-cursor">|</span>');
                
                // Auto-scroll the summary container to bottom
                if (containerElement) {
                    containerElement.scrollTop = containerElement.scrollHeight;
                }
            });
        }
    }

    /**
     * Optimized summary completion
     */
    completeStreamingSummaryOptimized(data) {
        // Only update if we're viewing the correct discussion
        if (!this.currentViewingDiscussion || this.currentViewingDiscussion.id !== data.discussionId) return;
        
        const summaryElement = document.querySelector('.discussion-summary.streaming');
        const contentElement = document.getElementById(`summary-content-${data.summary.id}`);
        const containerElement = document.getElementById(`summary-container-${data.summary.id}`);
        const statusElement = document.getElementById(`summary-status-${data.summary.id}`);
        
        requestAnimationFrame(() => {
            if (summaryElement) {
                // Remove streaming class and indicator
                summaryElement.classList.remove('streaming');
                const streamingIndicator = summaryElement.querySelector('.streaming-indicator');
                if (streamingIndicator) streamingIndicator.remove();
            }
            
            if (contentElement) {
                // Remove typing cursor and set final content
                const cursor = contentElement.querySelector('.typing-cursor');
                if (cursor) cursor.remove();
                contentElement.innerHTML = data.summary.content;
                
                // Final scroll to ensure all content is visible
                if (containerElement) {
                    setTimeout(() => {
                        containerElement.scrollTop = containerElement.scrollHeight;
                    }, 100);
                }
            }
            
            if (statusElement) {
                statusElement.innerHTML = `
                    <span class="token-count">${data.tokenCount || 0} tokens</span>
                    <span class="completion-time">Completed at ${this.formatDate(new Date())}</span>
                `;
            }
            
            // Update the summary meta to show completion time
            const summaryMeta = summaryElement?.querySelector('.summary-meta');
            if (summaryMeta) {
                summaryMeta.innerHTML = `
                    <span>Generated by: ${data.summary.generatedBy}</span>
                    <span>Generated at: ${this.formatDate(data.summary.generatedAt)}</span>
                `;
            }
        });
        
        // Update the current viewing discussion to mark it as completed
        if (this.currentViewingDiscussion) {
            this.currentViewingDiscussion.status = 'completed';
            this.currentViewingDiscussion.summary = data.summary;
        }
        
        // Immediately update download button visibility
        setTimeout(() => {
            this.updateDownloadButtonVisibility(data.discussionId);
        }, 100);
        
        // Refresh the discussion list to show updated status
        this.loadDiscussions();
    }
}

// Initialize the discussion page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.discussionPageInstance = new DiscussionPage();
}); 