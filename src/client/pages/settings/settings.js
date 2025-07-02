// Settings Page JavaScript
import { ApiService } from '../../js/services/apiService.js';
import { WebSocketService } from '../../js/services/websocketService.js';
import { ToastManager } from '../../js/utils/toastManager.js';

class SettingsPage {
    constructor() {
        this.apiService = new ApiService();
        this.wsService = new WebSocketService();
        this.toastManager = new ToastManager();
        
        this.init();
    }

    async init() {
        console.log('Settings page initialized');
        await this.setupWebSocket();
        await this.loadSettings();
        await this.loadModels();
        await this.loadGPUConfig();
        this.setupEventListeners();
        
        // Initialize X auth method display
        setTimeout(() => this.toggleXAuthMethod(), 100);
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
                this.loadModels(); // Reload models when reconnected
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

    async loadSettings() {
        try {
            console.log('[SETTINGS] Starting to load settings...');
            
            // Load settings from localStorage or use defaults
            const settings = this.getStoredSettings();
            console.log('[SETTINGS] Loaded settings from localStorage:', settings);
            
            // Load model parameters from server (these are the actual values being used)
            try {
                console.log('[SETTINGS] Fetching model parameters from server...');
                const modelParamsResponse = await this.apiService.getModelParameters();
                console.log('[SETTINGS] Server response:', modelParamsResponse);
                
                if (modelParamsResponse.success) {
                    const serverParams = modelParamsResponse.data;
                    console.log('[SETTINGS] Loaded model parameters from server:', serverParams);
                    
                    // Override localStorage values with server values for model parameters
                    settings.temperature = serverParams.temperature;
                    settings.topP = serverParams.topP;
                    settings.numThread = serverParams.numThread;
                    
                    console.log('[SETTINGS] Final settings after server override:', settings);
                }
            } catch (error) {
                console.warn('[SETTINGS] Failed to load model parameters from server, using defaults:', error);
            }
            
            console.log('[SETTINGS] About to populate form with settings:', settings);
            this.populateForm(settings);
            
            // Update active preset after form is populated
            setTimeout(() => this.updateActivePreset(), 100);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    getStoredSettings() {
        const defaultSettings = {
            ollamaHost: 'http://localhost:11434',
            defaultRounds: 5,
            defaultSummaryModel: '',
            autoRefresh: true,
            soundNotifications: false,
            theme: 'light',
            maxConcurrentDiscussions: 3,
            messageTimeout: 60,
            debugMode: false,
            githubToken: '',
            githubUsername: '',
            githubDefaultRepo: '',
            githubAutoCommit: false,
            githubCommitMessage: 'Update from social media integration',
            githubBranch: 'main',
            xBearerToken: '',
            xApiKey: '',
            xApiSecret: '',
            xAccessToken: '',
            xAccessTokenSecret: '',
            xAutoHashtags: false,
            xDefaultHashtags: '#AI #Discussion #Ollama',
            xConfirmBeforePost: true,
            temperature: 0.7,
            topP: 0.9,
            numThread: 4
        };

        const stored = localStorage.getItem('ollamaDiscussionSettings');
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    }

    populateForm(settings) {
        console.log('[SETTINGS] populateForm called with settings:', settings);
        
        // Populate form fields with settings
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                    console.log(`[SETTINGS] Set checkbox ${key} to:`, settings[key]);
                } else {
                    element.value = settings[key];
                    console.log(`[SETTINGS] Set ${key} to:`, settings[key], 'element value now:', element.value);
                }
            } else {
                console.log(`[SETTINGS] Element not found for key: ${key}`);
            }
        });
        
        // Specifically check temperature field
        const tempElement = document.getElementById('temperature');
        if (tempElement) {
            console.log('[SETTINGS] Temperature element found, current value:', tempElement.value);
        } else {
            console.log('[SETTINGS] Temperature element NOT found!');
        }
    }

    async loadModels() {
        try {
            const modelsResponse = await this.apiService.getModels();
            // Extract data from API response structure
            const models = Array.isArray(modelsResponse) ? modelsResponse : (modelsResponse.data || []);
            this.populateModelSelect(models);
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    populateModelSelect(models) {
        const select = document.getElementById('defaultSummaryModel');
        if (!select) return;

        // Clear existing options except the first one
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }

        // Add model options
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            select.appendChild(option);
        });
    }

    async saveSettings() {
        try {
            const settings = this.collectFormData();
            
            // Save model parameters to server first
            const modelParameters = {
                temperature: parseFloat(settings.temperature || 0.7),
                topP: parseFloat(settings.topP || 0.9),
                numThread: parseInt(settings.numThread || 4)
            };
            
            console.log('[SETTINGS] Saving model parameters to server:', modelParameters);
            const paramResponse = await this.apiService.updateModelParameters(modelParameters);
            
            if (!paramResponse.success) {
                throw new Error('Failed to save model parameters to server');
            }
            
            // Save other settings to localStorage
            localStorage.setItem('ollamaDiscussionSettings', JSON.stringify(settings));
            this.toastManager.show('Settings saved successfully!', 'success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.toastManager.show('Failed to save settings: ' + error.message, 'error');
        }
    }

    collectFormData() {
        const settings = {};
        const formElements = document.querySelectorAll('.settings-container input, .settings-container select');
        
        formElements.forEach(element => {
            if (element.id) {
                if (element.type === 'checkbox') {
                    settings[element.id] = element.checked;
                } else if (element.type === 'number') {
                    // Handle float parameters (temperature, topP) and integer parameters (numThread, etc.)
                    if (element.id === 'temperature' || element.id === 'topP') {
                        settings[element.id] = parseFloat(element.value);
                    } else {
                        settings[element.id] = parseInt(element.value);
                    }
                } else {
                    settings[element.id] = element.value;
                }
            }
        });

        return settings;
    }

    async resetSettings() {
        try {
            const defaultSettings = this.getStoredSettings();
            
            // Reset model parameters on server
            const defaultModelParams = {
                temperature: 0.7,
                topP: 0.9,
                numThread: 4
            };
            
            console.log('[SETTINGS] Resetting model parameters on server:', defaultModelParams);
            const paramResponse = await this.apiService.updateModelParameters(defaultModelParams);
            
            if (!paramResponse.success) {
                throw new Error('Failed to reset model parameters on server');
            }
            
            // Reset form and localStorage
            this.populateForm(defaultSettings);
            localStorage.removeItem('ollamaDiscussionSettings');
            this.toastManager.show('Settings reset to defaults', 'info');
        } catch (error) {
            console.error('Failed to reset settings:', error);
            this.toastManager.show('Failed to reset settings: ' + error.message, 'error');
        }
    }

    async testConnection() {
        try {
            const ollamaHost = document.getElementById('ollamaHost').value;
            this.toastManager.show('Testing connection...', 'info');
            
            // Test Ollama connection
            const status = await this.apiService.checkOllamaHealth();
            if (status.connected) {
                this.toastManager.show('Connection test successful!', 'success');
            } else {
                this.toastManager.show('Connection test failed - Ollama service not accessible', 'error');
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            this.toastManager.show('Connection test failed: ' + error.message, 'error');
        }
    }

    exportData() {
        try {
            // Export logic would go here
            this.toastManager.show('Export feature coming soon!', 'info');
        } catch (error) {
            console.error('Export failed:', error);
            this.toastManager.show('Export failed', 'error');
        }
    }

    clearData() {
        // Show confirmation modal
        this.toastManager.show('Clear data feature coming soon!', 'info');
    }

    // GPU Configuration Methods
    async loadGPUConfig() {
        try {
            const response = await this.apiService.getGPUConfig();
            if (response.success) {
                this.populateGPUForm(response.data);
                this.updateGPUUI(response.data);
            }
        } catch (error) {
            console.error('Failed to load GPU config:', error);
            // Use default values if loading fails
            this.populateGPUForm({
                enableGPU: true,
                selectedGPU: -1,
                numGPU: -1,
                numThread: 0,
                availableGPUs: []
            });
        }
    }

    populateGPUForm(config) {
        const enableGPU = document.getElementById('enableGPU');
        const selectedGPU = document.getElementById('selectedGPU');
        const numGPU = document.getElementById('numGPU');
        const numThread = document.getElementById('numThread');

        if (enableGPU) enableGPU.checked = config.enableGPU;
        if (selectedGPU) selectedGPU.value = config.selectedGPU;
        if (numGPU) numGPU.value = config.numGPU;
        if (numThread) numThread.value = config.numThread;

        // Populate GPU select options
        if (config.availableGPUs && config.availableGPUs.length > 0) {
            this.populateGPUSelect(config.availableGPUs);
            this.displayGPUList(config.availableGPUs);
        }
    }

    populateGPUSelect(gpus) {
        const select = document.getElementById('selectedGPU');
        if (!select) return;

        // Clear existing options except the first one (All GPUs)
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }

        // Sort GPUs: NVIDIA first, then others
        const sortedGPUs = [...gpus].sort((a, b) => {
            if (a.isNVIDIA && !b.isNVIDIA) return -1;
            if (!a.isNVIDIA && b.isNVIDIA) return 1;
            return a.id - b.id;
        });

        // Add GPU options
        sortedGPUs.forEach(gpu => {
            const option = document.createElement('option');
            option.value = gpu.id;
            
            // Format display name with type indicator
            const typeIndicator = gpu.isNVIDIA ? '🚀 NVIDIA' : 
                                 gpu.type === 'AMD' ? '🔥 AMD' : 
                                 gpu.type;
            option.textContent = `GPU ${gpu.id}: ${gpu.name} (${typeIndicator})`;
            
            // Highlight NVIDIA cards
            if (gpu.isNVIDIA) {
                option.style.backgroundColor = '#d4edda';
                option.style.fontWeight = 'bold';
            }
            
            select.appendChild(option);
        });
    }

    displayGPUList(gpus) {
        const gpuList = document.getElementById('gpuList');
        const gpuStatus = document.getElementById('gpuStatus');
        
        if (!gpuList || !gpuStatus) return;

        if (gpus.length === 0) {
            gpuStatus.style.display = 'none';
            return;
        }

        gpuStatus.style.display = 'block';
        
        // Sort GPUs: NVIDIA first, then others
        const sortedGPUs = [...gpus].sort((a, b) => {
            if (a.isNVIDIA && !b.isNVIDIA) return -1;
            if (!a.isNVIDIA && b.isNVIDIA) return 1;
            return a.id - b.id;
        });
        
        gpuList.innerHTML = sortedGPUs.map(gpu => {
            const isRecommended = gpu.isNVIDIA;
            const typeIcon = gpu.isNVIDIA ? '🚀' : gpu.type === 'AMD' ? '🔥' : '💻';
            
            return `
                <div class="gpu-item ${isRecommended ? 'gpu-recommended' : ''}">
                    <div class="gpu-info">
                        <div class="gpu-name">
                            ${typeIcon} GPU ${gpu.id}: ${gpu.name}
                            ${isRecommended ? '<span class="recommended-badge">recommended</span>' : ''}
                        </div>
                        <div class="gpu-details">
                            memory: ${gpu.memory} | type: ${gpu.vendor || gpu.type}
                            ${gpu.deviceId ? `<br><small>deviceId: ${gpu.deviceId}</small>` : ''}
                        </div>
                    </div>
                    <div class="gpu-type ${gpu.type.toLowerCase()}">${gpu.type}</div>
                </div>
            `;
        }).join('');
    }

    updateGPUUI(config) {
        const gpuSelectionGroup = document.getElementById('gpuSelectionGroup');
        const numGPUGroup = document.getElementById('numGPUGroup');

        if (config.enableGPU) {
            gpuSelectionGroup?.classList.remove('disabled');
            numGPUGroup?.classList.remove('disabled');
        } else {
            gpuSelectionGroup?.classList.add('disabled');
            numGPUGroup?.classList.add('disabled');
        }
    }

    async detectGPUs() {
        try {
            const detectBtn = document.getElementById('detectGPUsBtn');
            const originalText = detectBtn.innerHTML;
            
            detectBtn.disabled = true;
            detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
            
            this.toastManager.show('Detecting GPUs...', 'info');
            
            const response = await this.apiService.detectGPUs();
            if (response.success) {
                this.populateGPUSelect(response.data.gpus);
                this.displayGPUList(response.data.gpus);
                this.toastManager.show(`Detected ${response.data.gpus.length} GPU(s)`, 'success');
            } else {
                this.toastManager.show('Failed to detect GPUs', 'error');
            }
        } catch (error) {
            console.error('GPU detection failed:', error);
            this.toastManager.show('GPU detection failed: ' + error.message, 'error');
        } finally {
            const detectBtn = document.getElementById('detectGPUsBtn');
            detectBtn.disabled = false;
            detectBtn.innerHTML = '<i class="fas fa-search"></i> Detect GPUs';
        }
    }

    async resetGPUConfig() {
        try {
            this.toastManager.show('Resetting GPU configuration...', 'info');
            
            const response = await this.apiService.resetGPUConfig();
            if (response.success) {
                this.populateGPUForm(response.data);
                this.updateGPUUI(response.data);
                this.toastManager.show('GPU configuration reset to defaults', 'success');
            } else {
                this.toastManager.show('Failed to reset GPU configuration', 'error');
            }
        } catch (error) {
            console.error('GPU config reset failed:', error);
            this.toastManager.show('GPU config reset failed: ' + error.message, 'error');
        }
    }

    async saveGPUConfig() {
        try {
            const config = {
                enableGPU: document.getElementById('enableGPU')?.checked || false,
                selectedGPU: parseInt(document.getElementById('selectedGPU')?.value || -1),
                numGPU: parseInt(document.getElementById('numGPU')?.value || -1)
            };

            const response = await this.apiService.updateGPUConfig(config);
            if (response.success) {
                this.updateGPUUI(response.data);
                return true;
            } else {
                this.toastManager.show('Failed to save GPU configuration', 'error');
                return false;
            }
        } catch (error) {
            console.error('Failed to save GPU config:', error);
            this.toastManager.show('Failed to save GPU configuration: ' + error.message, 'error');
            return false;
        }
    }

    setupEventListeners() {
        // Save settings button
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                // Save GPU configuration first
                const gpuSaved = await this.saveGPUConfig();
                
                if (gpuSaved) {
                    // Save all other settings including model parameters
                    await this.saveSettings();
                }
            });
        }

        // Reset settings button
        const resetBtn = document.getElementById('resetSettingsBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                await this.resetSettings();
            });
        }

        // Test connection button
        const testBtn = document.getElementById('testConnectionBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this.testConnection();
            });
        }

        // Export data button
        const exportBtn = document.getElementById('exportDataBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }

        // Clear data button
        const clearBtn = document.getElementById('clearDataBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearData();
            });
        }

        // GPU configuration event listeners
        const enableGPUCheckbox = document.getElementById('enableGPU');
        if (enableGPUCheckbox) {
            enableGPUCheckbox.addEventListener('change', (e) => {
                this.updateGPUUI({ enableGPU: e.target.checked });
            });
        }

        const detectGPUsBtn = document.getElementById('detectGPUsBtn');
        if (detectGPUsBtn) {
            detectGPUsBtn.addEventListener('click', () => {
                this.detectGPUs();
            });
        }

        const resetGPUBtn = document.getElementById('resetGPUBtn');
        if (resetGPUBtn) {
            resetGPUBtn.addEventListener('click', () => {
                this.resetGPUConfig();
            });
        }

        // GitHub Token event listeners
        const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
        if (toggleTokenVisibility) {
            toggleTokenVisibility.addEventListener('click', () => {
                this.toggleTokenVisibility();
            });
        }

        const testGithubTokenBtn = document.getElementById('testGithubTokenBtn');
        if (testGithubTokenBtn) {
            testGithubTokenBtn.addEventListener('click', () => {
                this.testGithubToken();
            });
        }

        const clearGithubTokenBtn = document.getElementById('clearGithubTokenBtn');
        if (clearGithubTokenBtn) {
            clearGithubTokenBtn.addEventListener('click', () => {
                this.clearGithubToken();
            });
        }

        // Auto-save GitHub token when input changes
        const githubTokenInput = document.getElementById('githubToken');
        if (githubTokenInput) {
            githubTokenInput.addEventListener('blur', () => {
                this.saveGithubToken();
            });
        }

        // X platform event listeners
        const toggleXTokenBtn = document.getElementById('toggleXTokenVisibility');
        if (toggleXTokenBtn) {
            toggleXTokenBtn.addEventListener('click', () => {
                this.toggleXTokenVisibility();
            });
        }

        const xAuthMethodInputs = document.querySelectorAll('input[name="xAuthMethod"]');
        xAuthMethodInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.toggleXAuthMethod();
            });
        });

        // Auto-save X settings when they change
        const xInputs = ['xBearerToken', 'xApiKey', 'xApiSecret', 'xAccessToken', 'xAccessTokenSecret', 'xDefaultHashtags'];
        xInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('blur', () => {
                    this.saveSettings();
                });
            }
        });

        const xCheckboxes = ['xAutoHashtags', 'xConfirmBeforePost'];
        xCheckboxes.forEach(checkboxId => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    this.saveSettings();
                });
            }
        });

        // Model parameter preset buttons
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.applyParameterPreset(btn.dataset.preset);
            });
        });

        // Update active preset when parameters change
        const temperatureInput = document.getElementById('temperature');
        const topPInput = document.getElementById('topP');
        
        if (temperatureInput) {
            temperatureInput.addEventListener('input', () => {
                setTimeout(() => this.updateActivePreset(), 100);
            });
        }
        
        if (topPInput) {
            topPInput.addEventListener('input', () => {
                setTimeout(() => this.updateActivePreset(), 100);
            });
        }
    }

    // GitHub Token related methods
    toggleTokenVisibility() {
        const tokenInput = document.getElementById('githubToken');
        const toggleBtn = document.getElementById('toggleTokenVisibility');
        const icon = toggleBtn.querySelector('i');
        
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            tokenInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    async testGithubToken() {
        const tokenInput = document.getElementById('githubToken');
        const token = tokenInput.value.trim();
        const statusDiv = document.getElementById('githubTokenStatus');
        const statusContent = statusDiv.querySelector('.status-content');
        const statusText = statusContent.querySelector('.status-text');
        const statusIcon = statusContent.querySelector('i');
        
        if (!token) {
            this.showTokenStatus('warning', 'Please enter a GitHub token first');
            return;
        }

        try {
            // Show loading state
            this.showTokenStatus('info', 'Testing GitHub token...');
            
            // Test the token by making a request to GitHub API
            const response = await fetch('https://api.github.com/rate_limit', {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Ollama-Installer/1.0'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const remaining = data.rate.remaining;
                const limit = data.rate.limit;
                const resetTime = new Date(data.rate.reset * 1000).toLocaleTimeString();
                
                this.showTokenStatus('success', 
                    `Token is valid! Rate limit: ${remaining}/${limit} remaining. Resets at ${resetTime}`);
                
                // Show rate limit info
                this.showRateLimitInfo(data.rate);
            } else if (response.status === 401) {
                this.showTokenStatus('error', 'Invalid GitHub token. Please check your token and try again.');
            } else {
                this.showTokenStatus('error', `GitHub API error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('GitHub token test failed:', error);
            this.showTokenStatus('error', `Test failed: ${error.message}`);
        }
    }

    showTokenStatus(type, message) {
        const statusDiv = document.getElementById('githubTokenStatus');
        const statusContent = statusDiv.querySelector('.status-content');
        const statusText = statusContent.querySelector('.status-text');
        const statusIcon = statusContent.querySelector('i');
        
        // Remove existing status classes
        statusDiv.className = 'token-status';
        statusDiv.classList.add(type);
        
        // Update icon based on type
        switch (type) {
            case 'success':
                statusIcon.className = 'fas fa-check-circle';
                break;
            case 'error':
                statusIcon.className = 'fas fa-exclamation-circle';
                break;
            case 'warning':
                statusIcon.className = 'fas fa-exclamation-triangle';
                break;
            case 'info':
                statusIcon.className = 'fas fa-info-circle';
                break;
        }
        
        statusText.textContent = message;
        statusDiv.style.display = 'block';
    }

    showRateLimitInfo(rateData) {
        const statusDiv = document.getElementById('githubTokenStatus');
        
        // Create or update rate limit info
        let rateLimitDiv = statusDiv.querySelector('.rate-limit-info');
        if (!rateLimitDiv) {
            rateLimitDiv = document.createElement('div');
            rateLimitDiv.className = 'rate-limit-info';
            statusDiv.appendChild(rateLimitDiv);
        }
        
        rateLimitDiv.innerHTML = `
            <div class="limit-item">
                <span>Remaining:</span>
                <span class="limit-value">${rateData.remaining}</span>
            </div>
            <div class="limit-item">
                <span>Limit:</span>
                <span class="limit-value">${rateData.limit}</span>
            </div>
            <div class="limit-item">
                <span>Resets:</span>
                <span class="limit-value">${new Date(rateData.reset * 1000).toLocaleTimeString()}</span>
            </div>
        `;
    }

    clearGithubToken() {
        if (confirm('Are you sure you want to clear the GitHub token?')) {
            document.getElementById('githubToken').value = '';
            this.saveGithubToken();
            this.showTokenStatus('info', 'GitHub token cleared');
        }
    }

    saveGithubToken() {
        const token = document.getElementById('githubToken').value.trim();
        const settings = this.getStoredSettings();
        settings.githubToken = token;
        localStorage.setItem('ollamaDiscussionSettings', JSON.stringify(settings));
        
        if (token) {
            this.toastManager.show('GitHub token saved', 'success');
        }
    }

    // X Platform related methods
    toggleXTokenVisibility() {
        const tokenInput = document.getElementById('xBearerToken');
        const toggleBtn = document.getElementById('toggleXTokenVisibility');
        const icon = toggleBtn.querySelector('i');
        
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            tokenInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    toggleXAuthMethod() {
        const bearerSelected = document.getElementById('xAuthMethodBearer').checked;
        const bearerConfig = document.getElementById('xBearerTokenConfig');
        const oauthConfig = document.getElementById('xOAuthConfig');
        
        if (bearerSelected) {
            bearerConfig.style.display = 'block';
            oauthConfig.style.display = 'none';
        } else {
            bearerConfig.style.display = 'none';
            oauthConfig.style.display = 'block';
        }
    }

    // Model parameter preset methods
    async applyParameterPreset(presetName) {
        const presets = {
            creative: { temperature: 1.0, topP: 0.95 },
            balanced: { temperature: 0.7, topP: 0.9 },
            focused: { temperature: 0.3, topP: 0.7 }
        };

        const preset = presets[presetName];
        if (!preset) return;

        try {
            // Update form fields
            const temperatureInput = document.getElementById('temperature');
            const topPInput = document.getElementById('topP');

            if (temperatureInput) temperatureInput.value = preset.temperature;
            if (topPInput) topPInput.value = preset.topP;

            // Save to server immediately
            const numThread = parseInt(document.getElementById('numThread')?.value || 4);
            const parameters = {
                temperature: preset.temperature,
                topP: preset.topP,
                numThread: numThread
            };

            console.log('[SETTINGS] Applying preset and saving to server:', presetName, parameters);
            const response = await this.apiService.updateModelParameters(parameters);
            
            if (!response.success) {
                throw new Error('Failed to save preset to server');
            }

            // Update active preset button
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-preset="${presetName}"]`)?.classList.add('active');

            // Show feedback
            const presetNames = {
                creative: 'Creative',
                balanced: 'Balanced', 
                focused: 'Focused'
            };
            this.toastManager.show(`Applied ${presetNames[presetName]} preset and saved to server`, 'success');
        } catch (error) {
            console.error('Failed to apply preset:', error);
            this.toastManager.show('Failed to apply preset: ' + error.message, 'error');
        }
    }

    // Check which preset is currently active based on values
    updateActivePreset() {
        const temperature = parseFloat(document.getElementById('temperature')?.value || 0.7);
        const topP = parseFloat(document.getElementById('topP')?.value || 0.9);

        const presets = {
            creative: { temperature: 1.0, topP: 0.95 },
            balanced: { temperature: 0.7, topP: 0.9 },
            focused: { temperature: 0.3, topP: 0.7 }
        };

        // Remove all active classes
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Find matching preset
        for (const [name, preset] of Object.entries(presets)) {
            if (Math.abs(temperature - preset.temperature) < 0.05 && 
                Math.abs(topP - preset.topP) < 0.05) {
                document.querySelector(`[data-preset="${name}"]`)?.classList.add('active');
                break;
            }
        }
    }
}

// Initialize the settings page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsPage();
}); 