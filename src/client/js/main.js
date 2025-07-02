import { ApiService } from './services/apiService.js';
import { WebSocketService } from './services/websocketService.js';
import { UIManager } from './utils/uiManager.js';
import { ToastManager } from './utils/toastManager.js';
import { ModalManager } from './utils/modalManager.js';

class App {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.uiManager = new UIManager();
        this.toastManager = new ToastManager();
        this.modalManager = new ModalManager();
        
        this.currentPage = 'discussions';
        this.discussions = [];
        this.models = [];
        this.stats = {};
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupWebSocket();
        await this.loadInitialData();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.switchPage(page);
            });
        });

        // New Discussion
        document.getElementById('newDiscussionBtn').addEventListener('click', () => {
            this.openNewDiscussionModal();
        });

        document.getElementById('newDiscussionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createDiscussion();
        });

        // Pull Model
        document.getElementById('pullModelBtn').addEventListener('click', () => {
            this.openPullModelModal();
        });

        document.getElementById('pullModelForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.pullModel();
        });

        // Model tags in pull modal
        document.querySelectorAll('.model-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                document.getElementById('modelNameInput').value = tag.dataset.model;
            });
        });

        // Refresh buttons
        document.getElementById('refreshStatusBtn').addEventListener('click', () => {
            this.checkOllamaStatus();
        });

        document.getElementById('refreshModelsBtn').addEventListener('click', () => {
            this.loadModels();
        });

        // Settings
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('resetSettingsBtn').addEventListener('click', () => {
            this.resetSettings();
        });

        // Status filter (only if element exists)
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterDiscussions(e.target.value);
            });
        }

        // Modal close handlers
        document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = btn.dataset.modal || btn.closest('.modal').id;
                this.modalManager.closeModal(modalId);
            });
        });

        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.modalManager.closeModal(modal.id);
                }
            });
        });
    }

    setupWebSocket() {
        this.wsService.onMessage = (data) => {
            this.handleWebSocketMessage(data);
        };

        this.wsService.onConnectionChange = (connected) => {
            this.updateConnectionStatus(connected);
        };

        this.wsService.connect();
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'discussion_update':
                this.handleDiscussionUpdate(data);
                break;
            case 'model_pull_progress':
                this.handleModelPullProgress(data);
                break;
            case 'model_pull_completed':
                this.handleModelPullCompleted(data);
                break;
            case 'model_pull_error':
                this.handleModelPullError(data);
                break;
            case 'model_deleted':
                this.handleModelDeleted(data);
                break;
        }
    }

    handleDiscussionUpdate(data) {
        switch (data.type) {
            case 'discussion_started':
                this.toastManager.show('Discussion started!', 'success');
                this.loadDiscussions();
                break;
            case 'new_message':
                this.toastManager.show(`New message from ${data.message.modelName}`, 'info');
                this.loadDiscussions();
                break;
            case 'discussion_completed':
                this.toastManager.show('Discussion completed with summary!', 'success');
                this.loadDiscussions();
                break;
            case 'discussion_error':
                this.toastManager.show(`Discussion error: ${data.error}`, 'error');
                this.loadDiscussions();
                break;
        }
    }

    handleModelPullProgress(data) {
        const progressContainer = document.getElementById('pullProgress');
        const progressFill = progressContainer.querySelector('.progress-fill');
        const progressText = progressContainer.querySelector('.progress-text');
        
        progressContainer.style.display = 'block';
        
        if (data.progress && data.progress.completed && data.progress.total) {
            const percentage = (data.progress.completed / data.progress.total) * 100;
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `Pulling ${data.modelName}... ${Math.round(percentage)}%`;
        } else {
            progressText.textContent = `Pulling ${data.modelName}...`;
        }
    }

    handleModelPullCompleted(data) {
        this.toastManager.show(`Model ${data.modelName} pulled successfully!`, 'success');
        this.modalManager.closeModal('pullModelModal');
        this.loadModels();
        
        // Reset progress
        const progressContainer = document.getElementById('pullProgress');
        progressContainer.style.display = 'none';
        document.getElementById('pullModelForm').reset();
    }

    handleModelPullError(data) {
        this.toastManager.show(`Failed to pull model: ${data.error}`, 'error');
        
        // Reset progress
        const progressContainer = document.getElementById('pullProgress');
        progressContainer.style.display = 'none';
    }

    handleModelDeleted(data) {
        this.toastManager.show(data.message, 'success');
        this.loadModels();
    }

    updateConnectionStatus(connected) {
        const statusIndicator = document.getElementById('connectionStatus');
        const icon = statusIndicator.querySelector('i');
        const text = statusIndicator.querySelector('span');
        
        statusIndicator.className = 'status-indicator';
        
        if (connected) {
            statusIndicator.classList.add('connected');
            icon.className = 'fas fa-circle';
            text.textContent = 'Connected';
        } else {
            statusIndicator.classList.add('disconnected');
            icon.className = 'fas fa-circle';
            text.textContent = 'Disconnected';
        }
    }

    async loadInitialData() {
        this.uiManager.showLoading();
        
        try {
            await Promise.all([
                this.loadDiscussions(),
                this.loadModels(),
                this.loadStats(),
                this.checkOllamaStatus()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.toastManager.show('Failed to load initial data', 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    async loadDiscussions() {
        try {
            const response = await this.apiService.getDiscussions();
            this.discussions = response.data;
            this.renderDiscussions();
        } catch (error) {
            console.error('Error loading discussions:', error);
            this.toastManager.show('Failed to load discussions', 'error');
        }
    }

    async loadModels() {
        try {
            const response = await this.apiService.getModels();
            this.models = response.data;
            this.renderModels();
            this.updateModelSelections();
        } catch (error) {
            console.error('Error loading models:', error);
            this.toastManager.show('Failed to load models', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await this.apiService.getDiscussionStats();
            this.stats = response.data;
            this.renderStats();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async checkOllamaStatus() {
        try {
            const response = await this.apiService.checkOllamaHealth();
            this.renderOllamaStatus(response.data);
        } catch (error) {
            console.error('Error checking Ollama status:', error);
            this.renderOllamaStatus({ status: 'unhealthy', message: 'Cannot connect to Ollama' });
        }
    }

    renderDiscussions() {
        const container = document.getElementById('discussionsList');
        
        if (this.discussions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments fa-3x"></i>
                    <h3>No discussions yet</h3>
                    <p>Create your first AI model discussion to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.discussions.map(discussion => `
            <div class="discussion-item" data-id="${discussion.id}">
                <div class="discussion-info">
                    <div class="discussion-topic">${discussion.topic}</div>
                    <div class="discussion-meta">
                        <span><i class="fas fa-robot"></i> ${discussion.models.length} models</span>
                        <span><i class="fas fa-message"></i> ${discussion.messageCount} messages</span>
                        <span><i class="fas fa-clock"></i> ${this.formatDate(discussion.createdAt)}</span>
                        <span class="status-badge ${discussion.status}">${discussion.status}</span>
                    </div>
                </div>
                <div class="discussion-actions">
                    ${this.getDiscussionActions(discussion)}
                </div>
            </div>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.discussion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.discussion-actions')) {
                    this.viewDiscussion(item.dataset.id);
                }
            });
        });

        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const discussionId = btn.closest('.discussion-item').dataset.id;
                this.handleDiscussionAction(action, discussionId);
            });
        });
    }

    getDiscussionActions(discussion) {
        const actions = [];
        
        if (discussion.status === 'created') {
            actions.push(`<button class="btn btn-success btn-sm" data-action="start"><i class="fas fa-play"></i> Start</button>`);
        }
        
        if (discussion.status === 'running') {
            actions.push(`<button class="btn btn-warning btn-sm" data-action="stop"><i class="fas fa-stop"></i> Stop</button>`);
        }
        
        actions.push(`<button class="btn btn-secondary btn-sm" data-action="view"><i class="fas fa-eye"></i> View</button>`);
        actions.push(`<button class="btn btn-error btn-sm" data-action="delete"><i class="fas fa-trash"></i> Delete</button>`);
        
        return actions.join('');
    }

    async handleDiscussionAction(action, discussionId) {
        try {
            switch (action) {
                case 'start':
                    await this.apiService.startDiscussion(discussionId);
                    this.toastManager.show('Discussion started!', 'success');
                    break;
                case 'stop':
                    await this.apiService.stopDiscussion(discussionId);
                    this.toastManager.show('Discussion stopped!', 'warning');
                    break;
                case 'view':
                    this.viewDiscussion(discussionId);
                    return;
                case 'delete':
                    if (confirm('Are you sure you want to delete this discussion?')) {
                        await this.apiService.deleteDiscussion(discussionId);
                        this.toastManager.show('Discussion deleted!', 'success');
                    }
                    break;
            }
            this.loadDiscussions();
            this.loadStats();
        } catch (error) {
            console.error(`Error ${action} discussion:`, error);
            this.toastManager.show(`Failed to ${action} discussion`, 'error');
        }
    }

    async viewDiscussion(discussionId) {
        try {
            const response = await this.apiService.getDiscussion(discussionId);
            const discussion = response.data;
            this.renderDiscussionDetail(discussion);
            this.modalManager.openModal('discussionDetailModal');
        } catch (error) {
            console.error('Error loading discussion details:', error);
            this.toastManager.show('Failed to load discussion details', 'error');
        }
    }

    renderDiscussionDetail(discussion) {
        const title = document.getElementById('discussionDetailTitle');
        const content = document.getElementById('discussionDetailContent');
        
        title.textContent = discussion.topic;
        
        content.innerHTML = `
            <div class="discussion-detail">
                <div class="discussion-header-detail">
                    <h4>Discussion Information</h4>
                    <div class="discussion-meta">
                        <p><strong>Status:</strong> <span class="status-badge ${discussion.status}">${discussion.status}</span></p>
                        <p><strong>Models:</strong> ${discussion.models.join(', ')}</p>
                        <p><strong>Summary Model:</strong> ${discussion.summaryModel}</p>
                        <p><strong>Rounds:</strong> ${discussion.currentRound} / ${discussion.maxRounds}</p>
                        <p><strong>Created:</strong> ${this.formatDate(discussion.createdAt)}</p>
                    </div>
                </div>
                
                <div class="discussion-messages">
                    <h4>Messages</h4>
                    ${discussion.messages.map(message => `
                        <div class="message-item">
                            <div class="message-header">
                                <span class="message-model">${message.modelName}</span>
                                <span>${this.formatDate(message.timestamp)}</span>
                            </div>
                            <div class="message-content">${message.content}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${discussion.summary ? `
                    <div class="discussion-summary">
                        <div class="summary-header">
                            <i class="fas fa-file-text"></i>
                            <span>Summary by ${discussion.summary.generatedBy}</span>
                        </div>
                        <div class="summary-content">${discussion.summary.content}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderModels() {
        const container = document.getElementById('modelsGrid');
        
        if (this.models.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-robot fa-3x"></i>
                    <h3>No models available</h3>
                    <p>Pull some models from Ollama to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.models.map(model => `
            <div class="model-card">
                <div class="model-header">
                    <div class="model-name">${model.name}</div>
                </div>
                <div class="model-info">
                    <div><strong>Size:</strong> ${this.formatBytes(model.size)}</div>
                    <div><strong>Modified:</strong> ${this.formatDate(model.modified_at)}</div>
                    <div><strong>Family:</strong> ${model.details?.family || 'Unknown'}</div>
                </div>
                <div class="model-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.testModel('${model.name}')">
                        <i class="fas fa-play"></i> Test
                    </button>
                    <button class="btn btn-error btn-sm" onclick="app.deleteModel('${model.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderStats() {
        document.getElementById('totalDiscussions').textContent = this.stats.total || 0;
        document.getElementById('runningDiscussions').textContent = this.stats.running || 0;
        document.getElementById('completedDiscussions').textContent = this.stats.completed || 0;
        document.getElementById('totalMessages').textContent = this.stats.totalMessages || 0;
    }

    renderOllamaStatus(status) {
        const container = document.querySelector('#ollamaStatus .status-content');
        const indicator = container.querySelector('.status-indicator');
        const icon = indicator.querySelector('i');
        const text = indicator.querySelector('span');
        
        indicator.className = 'status-indicator';
        
        if (status.status === 'healthy') {
            indicator.classList.add('connected');
            icon.className = 'fas fa-check-circle';
            text.textContent = 'Ollama is running';
        } else {
            indicator.classList.add('disconnected');
            icon.className = 'fas fa-exclamation-circle';
            text.textContent = status.message || 'Ollama is not accessible';
        }
    }

    updateModelSelections() {
        const modelSelection = document.getElementById('modelSelection');
        const summaryModelSelect = document.getElementById('summaryModelSelect');
        const defaultSummaryModel = document.getElementById('defaultSummaryModel');
        
        // Update model checkboxes
        modelSelection.innerHTML = this.models.map(model => `
            <label class="model-checkbox">
                <input type="checkbox" name="models" value="${model.name}">
                <span>${model.name}</span>
            </label>
        `).join('');
        
        // Update summary model selects
        const modelOptions = this.models.map(model => 
            `<option value="${model.name}">${model.name}</option>`
        ).join('');
        
        summaryModelSelect.innerHTML = '<option value="">Choose model for summary...</option>' + modelOptions;
        defaultSummaryModel.innerHTML = '<option value="">Select a model...</option>' + modelOptions;
    }

    async openNewDiscussionModal() {
        if (this.models.length < 2) {
            this.toastManager.show('You need at least 2 models to start a discussion', 'warning');
            return;
        }
        
        this.updateModelSelections();
        this.modalManager.openModal('newDiscussionModal');
    }

    async createDiscussion() {
        const form = document.getElementById('newDiscussionForm');
        const formData = new FormData(form);
        
        const topic = formData.get('topic') || document.getElementById('discussionTopic').value;
        const selectedModels = Array.from(document.querySelectorAll('input[name="models"]:checked')).map(cb => cb.value);
        const summaryModel = document.getElementById('summaryModelSelect').value;
        const maxRounds = parseInt(document.getElementById('maxRoundsInput').value);
        
        if (!topic || selectedModels.length < 2 || !summaryModel || !maxRounds) {
            this.toastManager.show('Please fill in all required fields', 'error');
            return;
        }
        
        try {
            await this.apiService.createDiscussion({
                topic,
                models: selectedModels,
                summaryModel,
                maxRounds
            });
            
            this.toastManager.show('Discussion created successfully!', 'success');
            this.modalManager.closeModal('newDiscussionModal');
            form.reset();
            this.loadDiscussions();
            this.loadStats();
        } catch (error) {
            console.error('Error creating discussion:', error);
            this.toastManager.show('Failed to create discussion', 'error');
        }
    }

    openPullModelModal() {
        this.modalManager.openModal('pullModelModal');
    }

    async pullModel() {
        const modelName = document.getElementById('modelNameInput').value.trim();
        
        if (!modelName) {
            this.toastManager.show('Please enter a model name', 'error');
            return;
        }
        
        try {
            document.getElementById('pullModelSubmit').disabled = true;
            await this.apiService.pullModel(modelName);
            // Progress updates will be handled via WebSocket
        } catch (error) {
            console.error('Error pulling model:', error);
            this.toastManager.show('Failed to start model pull', 'error');
            document.getElementById('pullModelSubmit').disabled = false;
        }
    }

    async testModel(modelName) {
        try {
            this.uiManager.showLoading();
            const response = await this.apiService.testModel(modelName);
            this.toastManager.show(`Model test successful: ${response.data.response.substring(0, 100)}...`, 'success');
        } catch (error) {
            console.error('Error testing model:', error);
            this.toastManager.show('Model test failed', 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    async deleteModel(modelName) {
        if (!confirm(`Are you sure you want to delete the model "${modelName}"?`)) {
            return;
        }
        
        try {
            await this.apiService.deleteModel(modelName);
            // Success will be handled via WebSocket
        } catch (error) {
            console.error('Error deleting model:', error);
            this.toastManager.show('Failed to delete model', 'error');
        }
    }

    filterDiscussions(status) {
        const items = document.querySelectorAll('.discussion-item');
        items.forEach(item => {
            const discussionStatus = item.querySelector('.status-badge').textContent.trim();
            if (!status || discussionStatus === status) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    switchPage(page) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');
        
        // Update pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(`${page}Page`).classList.add('active');
        
        this.currentPage = page;
        
        // Load page-specific data
        if (page === 'models') {
            this.loadModels();
            this.checkOllamaStatus();
        } else if (page === 'discussions') {
            this.loadDiscussions();
            this.loadStats();
        }
    }

    saveSettings() {
        // Save settings to localStorage
        const settings = {
            ollamaHost: document.getElementById('ollamaHost').value,
            defaultRounds: document.getElementById('defaultRounds').value,
            defaultSummaryModel: document.getElementById('defaultSummaryModel').value,
            autoRefresh: document.getElementById('autoRefresh').checked,
            soundNotifications: document.getElementById('soundNotifications').checked
        };
        
        localStorage.setItem('ollamaDiscussionSettings', JSON.stringify(settings));
        this.toastManager.show('Settings saved successfully!', 'success');
    }

    resetSettings() {
        localStorage.removeItem('ollamaDiscussionSettings');
        this.loadSettings();
        this.toastManager.show('Settings reset to defaults!', 'info');
    }

    loadSettings() {
        const defaultSettings = {
            ollamaHost: 'http://localhost:11434',
            defaultRounds: 5,
            defaultSummaryModel: '',
            autoRefresh: true,
            soundNotifications: false
        };
        
        const saved = localStorage.getItem('ollamaDiscussionSettings');
        const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        
        document.getElementById('ollamaHost').value = settings.ollamaHost;
        document.getElementById('defaultRounds').value = settings.defaultRounds;
        document.getElementById('defaultSummaryModel').value = settings.defaultSummaryModel;
        document.getElementById('autoRefresh').checked = settings.autoRefresh;
        document.getElementById('soundNotifications').checked = settings.soundNotifications;
    }

    startPeriodicUpdates() {
        // Update discussions every 30 seconds if auto-refresh is enabled
        setInterval(() => {
            const autoRefresh = document.getElementById('autoRefresh')?.checked;
            if (autoRefresh && this.currentPage === 'discussions') {
                this.loadDiscussions();
                this.loadStats();
            }
        }, 30000);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the application
window.app = new App(); 