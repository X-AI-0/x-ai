// Models Page JavaScript
import { ApiService } from '../../js/services/apiService.js';
import { WebSocketService } from '../../js/services/websocketService.js';
import { ToastManager } from '../../js/utils/toastManager.js';
import { ModelPuller } from '../../js/components/modelPuller.js';
import { ModelSelector } from '../../js/components/ModelSelector.js';

class ModelsPage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        this.modelPuller = new ModelPuller();
        
        this.providers = [];
        this.activeProvider = 'ollama';
        this.models = [];
        this.filteredModels = [];
        this.currentProviderConfig = null;
        this.currentTestModel = null;
        
        this.init();
    }

    async init() {
        console.log('[MODELS] Initializing models page...');
        
        // Setup WebSocket for real-time updates
        await this.setupWebSocket();
        
        // Load initial data
        await this.loadProviders();
        await this.loadModels();
        await this.checkOllamaStatus(); // Legacy support
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('[MODELS] Models page initialized');
    }

    async setupWebSocket() {
        try {
            await this.wsService.connect();
            
            // Listen for model-related events
            this.wsService.on('model_pull_progress', (data) => {
                this.handleModelPullProgress(data);
            });
            
            this.wsService.on('model_pull_complete', (data) => {
                this.handleModelPullComplete(data);
            });
            
            this.wsService.on('model_pull_error', (data) => {
                this.handleModelPullError(data);
            });
            
            this.wsService.on('model_deleted', (data) => {
                this.handleModelDeleted(data);
            });
            
            this.wsService.on('ollama_service_started', (data) => {
                this.handleServiceStarted(data);
            });
            
            this.wsService.on('ollama_service_stopped', (data) => {
                this.handleServiceStopped(data);
            });
            
        } catch (error) {
            console.error('[MODELS] WebSocket setup failed:', error);
        }
    }

    async loadProviders() {
        try {
            console.log('[MODELS] Loading providers...');
            const response = await this.apiService.getProviders();
            
            if (response.success) {
                this.providers = response.data.providers;
                this.activeProvider = response.data.activeProvider;
                
                this.renderProviders();
                this.updateProviderSelector();
                
                console.log('[MODELS] Providers loaded:', this.providers);
            }
        } catch (error) {
            console.error('[MODELS] Failed to load providers:', error);
            this.toastManager.show('Failed to load model providers', 'error');
        }
    }

    async loadModels() {
        try {
            console.log(`[MODELS] Loading models from active provider: ${this.activeProvider}`);
            
            // Load models only from the active provider
            const response = await this.apiService.getProviderModels(this.activeProvider);
            
            if (response.success) {
                this.models = response.data;
                this.filteredModels = [...this.models];
                this.renderModels();
                this.updateModelFilters();
                
                console.log(`[MODELS] Models loaded from ${this.activeProvider}:`, this.models.length);
            } else {
                // If provider models fail, show empty state
                this.models = [];
                this.filteredModels = [];
                this.renderModels();
                this.updateModelFilters();
                
                console.warn(`[MODELS] No models available from ${this.activeProvider}`);
            }
        } catch (error) {
            console.error('[MODELS] Failed to load models:', error);
            this.toastManager.show(`Failed to load models from ${this.activeProvider}`, 'error');
            
            // Show empty state on error
            this.models = [];
            this.filteredModels = [];
            this.renderModels();
        }
    }

    renderProviders() {
        const providersGrid = document.getElementById('providersGrid');
        if (!providersGrid) return;

        providersGrid.innerHTML = '';

        this.providers.forEach(provider => {
            const providerCard = this.createProviderCard(provider);
            providersGrid.appendChild(providerCard);
        });
    }

    createProviderCard(provider) {
        const card = document.createElement('div');
        card.className = `provider-card ${provider.id === this.activeProvider ? 'active' : ''}`;
        card.setAttribute('data-provider-id', provider.id);

        const statusClass = provider.status === 'connected' ? 'connected' : 
                           provider.status === 'disconnected' ? 'disconnected' : 'unknown';

        card.innerHTML = `
            <div class="provider-header">
                <div class="provider-info">
                    <h3>${provider.name}</h3>
                    <span class="provider-type ${provider.type}">${provider.type}</span>
                </div>
                <div class="provider-status ${statusClass}">
                    <i class="fas fa-circle"></i>
                    <span>${provider.status || 'unknown'}</span>
                </div>
            </div>
            <div class="provider-stats">
                <div class="stat">
                    <span class="stat-label">Models:</span>
                    <span class="stat-value">${provider.modelsCount}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">API Key:</span>
                    <span class="stat-value">${provider.config.apiKey ? '✓ Configured' : '✗ Not set'}</span>
                </div>
            </div>
            <div class="provider-actions">
                <button class="btn btn-sm btn-secondary" onclick="modelsPage.checkProviderHealth('${provider.id}')">
                    <i class="fas fa-heartbeat"></i>
                    Check Health
                </button>
                <button class="btn btn-sm btn-primary" onclick="modelsPage.configureProvider('${provider.id}')">
                    <i class="fas fa-cog"></i>
                    Configure
                </button>
                <button class="btn btn-sm ${provider.id === this.activeProvider ? 'btn-success' : 'btn-outline-primary'}" 
                        onclick="modelsPage.setActiveProvider('${provider.id}')"
                        ${provider.id === this.activeProvider ? 'disabled' : ''}>
                    <i class="fas fa-check"></i>
                    ${provider.id === this.activeProvider ? 'Active' : 'Activate'}
                </button>
            </div>
        `;

        return card;
    }

    updateProviderSelector() {
        const providerSelect = document.getElementById('providerSelect');
        if (!providerSelect) return;

        providerSelect.innerHTML = '';
        
        this.providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = provider.name;
            option.selected = provider.id === this.activeProvider;
            providerSelect.appendChild(option);
        });
    }



    updateModelFilters() {
        const familyFilter = document.getElementById('familyFilter');
        if (!familyFilter) return;

        // Get unique families
        const families = [...new Set(this.models.map(model => 
            model.details?.family || 'Unknown'
        ))].sort();

        // Keep "All Families" option
        const allOption = familyFilter.querySelector('option[value=""]');
        familyFilter.innerHTML = '';
        if (allOption) {
            familyFilter.appendChild(allOption);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'All Families';
            familyFilter.appendChild(option);
        }

        families.forEach(family => {
            const option = document.createElement('option');
            option.value = family;
            option.textContent = family;
            familyFilter.appendChild(option);
        });
    }

    renderModels() {
        const modelsGrid = document.getElementById('modelsGrid');
        const modelsHeader = document.querySelector('.models-header h2');
        if (!modelsGrid) return;

        // Update header based on active provider
        if (modelsHeader) {
            const activeProviderName = this.providers.find(p => p.id === this.activeProvider)?.name || 'Unknown';
            modelsHeader.textContent = `${activeProviderName} Models`;
        }

        modelsGrid.innerHTML = '';

        if (this.filteredModels.length === 0) {
            modelsGrid.innerHTML = `
                <div class="no-models">
                    <i class="fas fa-robot"></i>
                    <h3>No models found</h3>
                    <p>No models are available from the selected providers.</p>
                    <button class="btn btn-primary" onclick="modelsPage.loadModels()">
                        <i class="fas fa-refresh"></i>
                        Refresh Models
                    </button>
                </div>
            `;
            return;
        }

        this.filteredModels.forEach(model => {
            const modelCard = this.createModelCard(model);
            modelsGrid.appendChild(modelCard);
        });
    }

    createModelCard(model) {
        const card = document.createElement('div');
        card.className = `model-card ${model.isFavorite ? 'favorite' : ''}`;
        card.setAttribute('data-model-name', model.name);
        card.setAttribute('data-provider', model.providerId || 'ollama');

        const providerBadge = model.providerId ? 
            `<span class="provider-badge ${model.providerType}">${model.providerName}</span>` : '';

        const sizeInfo = model.size || (model.details?.parameter_size) || 'Unknown size';
        const family = model.details?.family || 'Unknown';

        // Handle pricing for cloud providers
        const pricingInfo = model.pricing ? `
            <div class="pricing-info">
                <span class="price-prompt">$${(model.pricing.prompt * 1000000).toFixed(2)}/1M tokens</span>
                <span class="price-completion">$${(model.pricing.completion * 1000000).toFixed(2)}/1M tokens</span>
                        </div>
        ` : '';

        card.innerHTML = `
            <div class="model-header">
                <div class="model-info">
                    <h3 class="model-name">${model.displayName || model.name}</h3>
                    ${providerBadge}
                    </div>
                <div class="model-meta">
                    <span class="model-family">${family}</span>
                    <span class="model-size">${sizeInfo}</span>
                </div>
            </div>
            <div class="model-details">
                ${model.description ? `<p class="model-description">${model.description}</p>` : ''}
                ${pricingInfo}
                <div class="model-stats">
                    <div class="stat">
                        <span class="stat-label">Context:</span>
                        <span class="stat-value">${model.context_length ? `${model.context_length} tokens` : 'Unknown'}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Modified:</span>
                        <span class="stat-value">${this.formatDate(model.modified_at)}</span>
                    </div>
                </div>
            </div>
            <div class="model-actions">
                <button class="btn btn-sm ${model.isFavorite ? 'btn-warning' : 'btn-outline-warning'}" 
                        onclick="modelsPage.toggleFavorite('${model.name}', '${model.providerId || 'ollama'}')"
                        title="${model.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                    <i class="fas fa-star${model.isFavorite ? '' : '-o'}"></i>
                    ${model.isFavorite ? 'Favorited' : 'Favorite'}
                </button>

                <button class="btn btn-sm btn-primary" onclick="modelsPage.testModel('${model.name}', '${model.providerId || 'ollama'}')">
                    <i class="fas fa-play"></i>
                    Test
                </button>
                ${model.providerId === 'ollama' ? `
                    <button class="btn btn-sm btn-danger" onclick="modelsPage.deleteModel('${model.name}')">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                    ` : ''}
                </div>
            `;
            
        return card;
    }

    setupEventListeners() {
        // Provider selector
        const providerSelect = document.getElementById('providerSelect');
        if (providerSelect) {
            providerSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.setActiveProvider(e.target.value);
                }
            });
        }

        // Configure provider button
        const configureProviderBtn = document.getElementById('configureProviderBtn');
        if (configureProviderBtn) {
            configureProviderBtn.addEventListener('click', () => {
                this.configureProvider(this.activeProvider);
            });
        }

        // Refresh providers button
        const refreshProvidersBtn = document.getElementById('refreshProvidersBtn');
        if (refreshProvidersBtn) {
            refreshProvidersBtn.addEventListener('click', () => {
                this.refreshAllProviders();
            });
        }

        // Model filters
        const providerFilter = document.getElementById('providerFilter');
        const familyFilter = document.getElementById('familyFilter');
        
        if (providerFilter) {
            providerFilter.addEventListener('change', () => this.applyFilters());
        }
        
        if (familyFilter) {
            familyFilter.addEventListener('change', () => this.applyFilters());
        }

        // Refresh models button
        const refreshModelsBtn = document.getElementById('refreshModelsBtn');
        if (refreshModelsBtn) {
            refreshModelsBtn.addEventListener('click', () => {
                this.loadModels();
            });
        }

        // Save provider config button
        const saveProviderConfigBtn = document.getElementById('saveProviderConfigBtn');
        if (saveProviderConfigBtn) {
            saveProviderConfigBtn.addEventListener('click', () => {
                this.saveProviderConfig();
            });
        }

        // Test model button
        const runTestBtn = document.getElementById('runTestBtn');
        if (runTestBtn) {
            runTestBtn.addEventListener('click', () => {
                this.runModelTest();
            });
        }

        // Legacy Ollama buttons
        this.setupLegacyEventListeners();
    }

    setupLegacyEventListeners() {
        // Pull model button
        const pullModelBtn = document.getElementById('pullModelBtn');
        if (pullModelBtn) {
            pullModelBtn.addEventListener('click', () => {
                if (this.activeProvider === 'ollama') {
                    this.modelPuller.show();
            } else {
                    this.toastManager.show('Model pulling is only available for Ollama provider', 'warning');
                }
            });
        }

        // Ollama service management buttons
        const startOllamaBtn = document.getElementById('startOllamaBtn');
        const stopOllamaBtn = document.getElementById('stopOllamaBtn');
        const restartOllamaBtn = document.getElementById('restartOllamaBtn');
        const refreshStatusBtn = document.getElementById('refreshStatusBtn');

        if (startOllamaBtn) {
            startOllamaBtn.addEventListener('click', () => this.startOllama());
        }
        if (stopOllamaBtn) {
            stopOllamaBtn.addEventListener('click', () => this.stopOllama());
        }
        if (restartOllamaBtn) {
            restartOllamaBtn.addEventListener('click', () => this.restartOllama());
        }
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => this.checkOllamaStatus());
        }
    }

    async setActiveProvider(providerId) {
        try {
            const response = await this.apiService.setActiveProvider(providerId);
            
            if (response.success) {
                this.activeProvider = providerId;
                this.toastManager.show(`Active provider set to ${providerId}`, 'success');
                
                // Update UI
                this.renderProviders();
                this.updateProviderSelector();
                
                // Reload models from new active provider
                await this.loadModels();
            }
        } catch (error) {
            console.error('[MODELS] Failed to set active provider:', error);
            this.toastManager.show('Failed to set active provider', 'error');
        }
    }

    async checkProviderHealth(providerId) {
        try {
            const response = await this.apiService.getProviderHealth(providerId);
            
            if (response.success) {
                const health = response.data;
                const status = health.connected ? 'connected' : 'disconnected';
                const message = health.message || 'Health check completed';
                
                this.toastManager.show(`${providerId}: ${message}`, status === 'connected' ? 'success' : 'warning');
                
                // Update provider status in UI
                this.updateProviderStatus(providerId, status);
            }
        } catch (error) {
            console.error('[MODELS] Failed to check provider health:', error);
            this.toastManager.show(`Failed to check ${providerId} health`, 'error');
        }
    }

    async refreshAllProviders() {
        try {
            const response = await this.apiService.getAllProvidersHealth();
            
            if (response.success) {
                const healthResults = response.data;
                
                // Update provider statuses
                Object.entries(healthResults).forEach(([providerId, health]) => {
                    const status = health.connected ? 'connected' : 'disconnected';
                    this.updateProviderStatus(providerId, status);
                });
                
                this.toastManager.show('All providers refreshed', 'success');
                
                // Reload providers and models
                await this.loadProviders();
                await this.loadModels();
            }
        } catch (error) {
            console.error('[MODELS] Failed to refresh providers:', error);
            this.toastManager.show('Failed to refresh providers', 'error');
        }
    }

    updateProviderStatus(providerId, status) {
        const providerCard = document.querySelector(`[data-provider-id="${providerId}"]`);
        if (providerCard) {
            const statusElement = providerCard.querySelector('.provider-status');
            if (statusElement) {
                statusElement.className = `provider-status ${status}`;
                statusElement.querySelector('span').textContent = status;
            }
        }
    }

    configureProvider(providerId) {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;

        this.currentProviderConfig = provider;
        this.showProviderConfigModal(provider);
    }

    showProviderConfigModal(provider) {
        const modal = document.getElementById('providerConfigModal');
        const title = document.getElementById('providerConfigTitle');
        const content = document.getElementById('providerConfigContent');

        title.textContent = `Configure ${provider.name}`;
        
        if (provider.id === 'openrouter') {
            content.innerHTML = this.createOpenRouterConfigForm(provider);
        } else if (provider.id === 'ollama') {
            content.innerHTML = this.createOllamaConfigForm(provider);
        } else {
            content.innerHTML = '<p>Configuration not available for this provider.</p>';
        }

        this.openModal('providerConfigModal');
    }

    createOpenRouterConfigForm(provider) {
        return `
            <div class="config-form">
                <div class="form-group">
                    <label for="openrouterApiKey">API Key:</label>
                    <input type="password" id="openrouterApiKey" class="form-control" 
                           placeholder="Enter your OpenRouter API key"
                           value="${provider.config.apiKey === '***configured***' ? '' : provider.config.apiKey || ''}">
                    <small class="form-text">Get your API key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a></small>
                </div>
                <div class="form-group">
                    <label for="openrouterAppName">App Name:</label>
                    <input type="text" id="openrouterAppName" class="form-control" 
                           placeholder="Your application name"
                           value="${provider.config.appName || ''}">
                </div>
                <div class="form-group">
                    <label for="openrouterSiteUrl">Site URL:</label>
                    <input type="url" id="openrouterSiteUrl" class="form-control" 
                           placeholder="Your site URL"
                           value="${provider.config.siteUrl || ''}">
                </div>
                <div class="config-info">
                    <h4>About OpenRouter</h4>
                    <p>OpenRouter provides access to multiple AI models through a unified API. You'll need an API key to use this service.</p>
                    <ul>
                        <li>Sign up at <a href="https://openrouter.ai" target="_blank">openrouter.ai</a></li>
                        <li>Get your API key from the dashboard</li>
                        <li>Models are charged per token usage</li>
                    </ul>
                </div>
                </div>
            `;
    }

    createOllamaConfigForm(provider) {
        return `
            <div class="config-form">
                <div class="form-group">
                    <label for="ollamaBaseUrl">Base URL:</label>
                    <input type="url" id="ollamaBaseUrl" class="form-control" 
                           placeholder="http://localhost:11434"
                           value="${provider.config.baseUrl || ''}">
                    <small class="form-text">URL where Ollama service is running</small>
                </div>
                <div class="config-info">
                    <h4>About Ollama</h4>
                    <p>Ollama runs AI models locally on your machine. Make sure the Ollama service is installed and running.</p>
                    <ul>
                        <li>Download from <a href="https://ollama.ai" target="_blank">ollama.ai</a></li>
                        <li>Models run locally on your hardware</li>
                        <li>No API costs, but requires local resources</li>
                    </ul>
                </div>
                    </div>
                `;
    }

    async saveProviderConfig() {
        if (!this.currentProviderConfig) return;

        const providerId = this.currentProviderConfig.id;
        let config = {};

        if (providerId === 'openrouter') {
            const apiKey = document.getElementById('openrouterApiKey')?.value;
            const appName = document.getElementById('openrouterAppName')?.value;
            const siteUrl = document.getElementById('openrouterSiteUrl')?.value;

            config = {
                apiKey: apiKey || undefined,
                appName: appName || undefined,
                siteUrl: siteUrl || undefined
            };
        } else if (providerId === 'ollama') {
            const baseUrl = document.getElementById('ollamaBaseUrl')?.value;
            config = {
                baseUrl: baseUrl || undefined
            };
        }

        try {
            const response = await this.apiService.updateProviderConfig(providerId, config);
            
            if (response.success) {
                this.toastManager.show(`${providerId} configuration saved`, 'success');
                this.closeModal('providerConfigModal');
                
                // Refresh providers to show updated config
                await this.loadProviders();
            }
        } catch (error) {
            console.error('[MODELS] Failed to save provider config:', error);
            this.toastManager.show('Failed to save configuration', 'error');
        }
    }

    applyFilters() {
        const familyFilter = document.getElementById('familyFilter')?.value;

        this.filteredModels = this.models.filter(model => {
            const familyMatch = !familyFilter || (model.details?.family === familyFilter);
            return familyMatch;
        });

        this.renderModels();
    }

    async testModel(modelName, providerId) {
        const modal = document.getElementById('modelTestModal');
        const modelNameSpan = document.getElementById('testModelName');
        const modelProviderSpan = document.getElementById('testModelProvider');
        const testResults = document.getElementById('testResults');

        modelNameSpan.textContent = modelName;
        modelProviderSpan.textContent = providerId;
        modelProviderSpan.className = `provider-badge ${this.getProviderType(providerId)}`;
        
        // Hide previous results
        testResults.style.display = 'none';

        this.currentTestModel = { name: modelName, providerId };
        this.openModal('modelTestModal');
    }

    async runModelTest() {
        if (!this.currentTestModel) return;

        const prompt = document.getElementById('testPrompt')?.value || 'Hello, how are you?';
        const runTestBtn = document.getElementById('runTestBtn');
        const testResults = document.getElementById('testResults');

        // Show loading state
        runTestBtn.disabled = true;
        runTestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';

        try {
            const response = await this.apiService.testProviderModel(
                this.currentTestModel.providerId,
                this.currentTestModel.name,
                prompt
            );

            if (response.success) {
                const data = response.data;
                
                // Show results
                document.getElementById('testResponse').textContent = data.response;
                document.getElementById('testResponseTime').textContent = `Response time: ${data.responseTime}ms`;
                document.getElementById('testUsage').textContent = data.usage ? 
                    `Usage: ${data.usage.prompt_tokens || 0} + ${data.usage.completion_tokens || 0} tokens` : 
                    'Usage: N/A';
                
                testResults.style.display = 'block';
                this.toastManager.show('Model test completed', 'success');
        } else {
                this.toastManager.show(`Test failed: ${response.error}`, 'error');
            }
        } catch (error) {
            console.error('[MODELS] Model test failed:', error);
            this.toastManager.show('Model test failed', 'error');
        } finally {
            // Reset button
            runTestBtn.disabled = false;
            runTestBtn.innerHTML = '<i class="fas fa-play"></i> Run Test';
        }
    }

    async toggleFavorite(modelName, providerId) {
        try {
            const response = await this.apiService.toggleModelFavorite(providerId, modelName);
            
            if (response.success) {
                const data = response.data;
                const action = data.action === 'added' ? 'added to' : 'removed from';
                this.toastManager.show(`${modelName} ${action} favorites`, 'success');
                
                // Reload models to update the display order and favorite status
                await this.loadModels();
        } else {
                this.toastManager.show('Failed to update favorite status', 'error');
            }
        } catch (error) {
            console.error('[MODELS] Failed to toggle favorite:', error);
            this.toastManager.show('Failed to update favorite status', 'error');
        }
    }

    getProviderType(providerId) {
        const provider = this.providers.find(p => p.id === providerId);
        return provider?.type || 'unknown';
    }

    async viewModelDetails(modelName, providerId) {
        try {
            const response = await this.apiService.getModelInfo(modelName, { provider: providerId });
            
            if (response.success) {
                this.showModelDetailModal(response.data);
            }
        } catch (error) {
            console.error('[MODELS] Failed to get model details:', error);
            this.toastManager.show('Failed to load model details', 'error');
        }
    }

    showModelDetailModal(modelData) {
        const modal = document.getElementById('modelDetailModal');
        const title = document.getElementById('modelDetailTitle');
        const content = document.getElementById('modelDetailContent');

        title.textContent = `${modelData.displayName || modelData.name} Details`;
        content.innerHTML = this.createModelDetailContent(modelData);

        this.openModal('modelDetailModal');
    }

    createModelDetailContent(model) {
        const providerInfo = model.providerId ? `
            <div class="detail-section">
                <h4>Provider Information</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Provider:</span>
                        <span class="detail-value">${model.providerName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Type:</span>
                        <span class="detail-value">${model.providerType}</span>
                    </div>
                </div>
            </div>
        ` : '';

        const pricingInfo = model.pricing ? `
            <div class="detail-section">
                <h4>Pricing</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Prompt:</span>
                        <span class="detail-value">$${(model.pricing.prompt * 1000000).toFixed(4)}/1M tokens</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Completion:</span>
                        <span class="detail-value">$${(model.pricing.completion * 1000000).toFixed(4)}/1M tokens</span>
                    </div>
                </div>
            </div>
        ` : '';

        return `
            <div class="model-detail-content">
                <div class="detail-section">
                    <h4>Basic Information</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Name:</span>
                            <span class="detail-value">${model.name}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Family:</span>
                            <span class="detail-value">${model.details?.family || 'Unknown'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Size:</span>
                            <span class="detail-value">${model.size || model.details?.parameter_size || 'Unknown'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Context Length:</span>
                            <span class="detail-value">${model.context_length ? `${model.context_length} tokens` : 'Unknown'}</span>
                        </div>
                    </div>
                </div>
                
                ${providerInfo}
                ${pricingInfo}
                
                ${model.description ? `
                    <div class="detail-section">
                        <h4>Description</h4>
                        <p>${model.description}</p>
                    </div>
                ` : ''}
                
                <div class="detail-section">
                    <h4>Technical Details</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Format:</span>
                            <span class="detail-value">${model.details?.format || 'Unknown'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Architecture:</span>
                            <span class="detail-value">${model.architecture || 'Unknown'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Modified:</span>
                            <span class="detail-value">${this.formatDate(model.modified_at)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Legacy Ollama methods
    async checkOllamaStatus() {
        try {
            console.log('[MODELS] Checking Ollama status...');
            // Use provider health check for more accurate status
            const response = await this.apiService.getProviderHealth('ollama');
            console.log('[MODELS] Ollama status response:', response);
            
            if (response.success) {
                const status = response.data;
                this.updateOllamaStatus(status.connected, status);
                return status.connected;
            } else {
                // Fallback to legacy health check
            const status = await this.apiService.checkOllamaHealth();
                console.log('[MODELS] Fallback Ollama status response:', status);
            this.updateOllamaStatus(status.connected, status);
            return status.connected;
            }
        } catch (error) {
            console.error('[MODELS] Failed to check Ollama status:', error);
            this.updateOllamaStatus(false);
            return false;
        }
    }

    updateOllamaStatus(connected, statusData = {}) {
        const statusCard = document.getElementById('ollamaStatus');
        const statusIndicator = statusCard?.querySelector('.status-indicator');
        const statusDetails = document.getElementById('statusDetails');

        if (!statusIndicator || !statusDetails) return;

        const icon = statusIndicator.querySelector('i');
        const text = statusIndicator.querySelector('span');

        if (connected) {
            icon.className = 'fas fa-circle text-success';
            text.textContent = 'Connected';
                statusDetails.innerHTML = `
                <p class="status-message text-success">${statusData.message || 'Ollama service is running'}</p>
                <div class="status-info">
                    <div class="info-item">
                        <span class="info-label">Host:</span>
                        <span class="info-value">${statusData.host || 'localhost:11434'}</span>
                            </div>
                    <div class="info-item">
                        <span class="info-label">Models Path:</span>
                        <span class="info-value">${statusData.modelsPath || 'default'}</span>
                        </div>
                    ${statusData.gpu ? `
                        <div class="info-item">
                            <span class="info-label">GPU:</span>
                            <span class="info-value">${statusData.gpu.gpuEnabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        ` : ''}
                    </div>
                `;
        } else {
            icon.className = 'fas fa-circle text-danger';
            text.textContent = 'Disconnected';
                statusDetails.innerHTML = `
                <p class="status-message text-danger">${statusData.message || 'Ollama service is not running'}</p>
                <p class="status-help">Make sure Ollama is installed and running on your system.</p>
            `;
        }
    }

    async startOllama() {
        this.setButtonLoading('startOllamaBtn', true);
        this.toastManager.show('Starting Ollama service...', 'info');

        try {
            const result = await this.apiService.startOllama();
            if (result.success) {
                this.toastManager.show('Ollama service started successfully!', 'success');
                await this.checkOllamaStatus();
                await this.loadModels();
            } else {
                this.toastManager.show(result.message || 'Failed to start Ollama service', 'error');
            }
        } catch (error) {
            console.error('Failed to start Ollama:', error);
            this.toastManager.show('Failed to start Ollama service: ' + error.message, 'error');
        } finally {
            this.setButtonLoading('startOllamaBtn', false);
        }
    }

    async stopOllama() {
        this.setButtonLoading('stopOllamaBtn', true);
        this.toastManager.show('Stopping Ollama service...', 'info');

        try {
            const result = await this.apiService.stopOllama();
            if (result.success) {
                this.toastManager.show('Ollama service stopped successfully!', 'success');
                await this.checkOllamaStatus();
                await this.loadModels();
            } else {
                this.toastManager.show(result.message || 'Failed to stop Ollama service', 'error');
            }
        } catch (error) {
            console.error('Failed to stop Ollama:', error);
            this.toastManager.show('Failed to stop Ollama service: ' + error.message, 'error');
        } finally {
            this.setButtonLoading('stopOllamaBtn', false);
        }
    }

    async restartOllama() {
        this.setButtonLoading('restartOllamaBtn', true);
        this.toastManager.show('Restarting Ollama service...', 'info');

        try {
            const result = await this.apiService.restartOllama();
            if (result.success) {
                this.toastManager.show('Ollama service restarted successfully!', 'success');
                await this.checkOllamaStatus();
                await this.loadModels();
            } else {
                this.toastManager.show(result.message || 'Failed to restart Ollama service', 'error');
            }
        } catch (error) {
            console.error('Failed to restart Ollama:', error);
            this.toastManager.show('Failed to restart Ollama service: ' + error.message, 'error');
        } finally {
            this.setButtonLoading('restartOllamaBtn', false);
        }
    }

    async deleteModel(modelName) {
        if (!confirm(`Are you sure you want to delete the model "${modelName}"?`)) {
            return;
        }

        try {
            const result = await this.apiService.deleteModel(modelName);
            if (result.success) {
                this.toastManager.show(`Model "${modelName}" deleted successfully`, 'success');
                await this.loadModels();
            } else {
                this.toastManager.show(result.error || 'Failed to delete model', 'error');
            }
        } catch (error) {
            console.error('Failed to delete model:', error);
            this.toastManager.show('Failed to delete model: ' + error.message, 'error');
        }
    }

    // WebSocket event handlers
    handleModelPullProgress(data) {
        console.log('[MODELS] Model pull progress:', data);
        // Handle via ModelPuller component
    }

    handleModelPullComplete(data) {
        console.log('[MODELS] Model pull complete:', data);
        this.toastManager.show(`Model "${data.modelName}" pulled successfully!`, 'success');
        this.loadModels();
    }

    handleModelPullError(data) {
        console.log('[MODELS] Model pull error:', data);
        this.toastManager.show(`Failed to pull model "${data.modelName}": ${data.error}`, 'error');
    }

    handleModelDeleted(data) {
        console.log('[MODELS] Model deleted:', data);
        this.toastManager.show(data.message, 'info');
        this.loadModels();
    }

    handleServiceStarted(data) {
        this.updateOllamaStatus(data.success, data);
        if (data.success) {
            this.toastManager.show('Ollama service started successfully!', 'success');
            this.loadModels();
        }
    }

    handleServiceStopped(data) {
        this.updateOllamaStatus(false, data);
        this.toastManager.show('Ollama service stopped', 'info');
        this.loadModels();
    }

    // Utility methods
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    }

    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (loading) {
            button.disabled = true;
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-spinner fa-spin';
            }
                        } else {
            button.disabled = false;
            const icon = button.querySelector('i');
            if (icon) {
                // Restore original icon based on button
                const iconMap = {
                    'startOllamaBtn': 'fas fa-play',
                    'stopOllamaBtn': 'fas fa-stop',
                    'restartOllamaBtn': 'fas fa-redo'
                };
                icon.className = iconMap[buttonId] || 'fas fa-refresh';
            }
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
        modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
}

// Initialize the models page
const modelsPage = new ModelsPage();
window.modelsPage = modelsPage;

// Setup modal close handlers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
        const modalId = e.target.getAttribute('data-modal') || e.target.closest('.modal-close').getAttribute('data-modal');
        if (modalId) {
            modelsPage.closeModal(modalId);
        }
    }
    
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        if (modalId) {
            modelsPage.closeModal(modalId);
        }
    }
}); 