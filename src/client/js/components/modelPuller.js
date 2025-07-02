// Model Puller Component - Independent model pulling functionality
import { ApiService } from '../services/apiService.js';
import { ToastManager } from '../utils/toastManager.js';
import { ModelSelector } from './ModelSelector.js';

export class ModelPuller {
    constructor(options = {}) {
        this.apiService = options.apiService || new ApiService();
        this.toastManager = options.toastManager || new ToastManager();
        this.wsService = options.wsService;
        
        // Configuration
        this.containerId = options.containerId || 'modelPullerModal';
        this.onModelPulled = options.onModelPulled || (() => {});
        this.onClose = options.onClose || (() => {});
        
        // State
        this.isPullingModel = false;
        this.currentDownloadId = null;
        this.isVisible = false;
        this.selectedModel = null;
        this.modelSelector = null;
        
        this.init();
    }

    init() {
        this.createModal();
        this.setupEventListeners();
        this.setupWebSocketListeners();
        this.initializeModelSelector();
    }

    initializeModelSelector() {
        const container = document.getElementById('modelSelectorContainer');
        if (container) {
            this.modelSelector = new ModelSelector(container, {
                allowMultiple: false,
                showSearch: true,
                showCategories: true,
                onSelectionChange: (selectedModels) => {
                    this.selectedModel = selectedModels.length > 0 ? selectedModels[0] : null;
                    this.updatePullButton();
                    
                    // Clear direct input when a model is selected from the selector
                    if (this.selectedModel) {
                        const input = document.getElementById('modelPullerInput');
                        if (input) {
                            input.value = '';
                        }
                    }
                }
            });
        }
    }

    createModal() {
        // Check if modal already exists
        if (document.getElementById(this.containerId)) {
            return;
        }

        const modalHTML = `
            <div id="${this.containerId}" class="model-puller-modal">
                <div class="model-puller-content">
                    <div class="model-puller-header">
                        <h2>Pull New Model</h2>
                        <button class="model-puller-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="model-puller-body">
                        <!-- Model Selection Section -->
                        <div class="model-selection-section">
                            <div id="modelSelectorContainer" class="model-selector-container">
                                <!-- ModelSelector component will be rendered here -->
                            </div>
                        </div>

                        <!-- Direct Model Input Section -->
                        <div class="direct-input-section">
                            <div class="direct-input-header">
                                <h4>Or Enter Model Name Directly</h4>
                                <p>If you know the exact model name, you can enter it below</p>
                            </div>
                            <form id="modelPullerForm">
                                <div class="model-puller-form-group">
                                    <label for="modelPullerInput">Model Name</label>
                                    <div class="model-puller-search-container">
                                        <input type="text" id="modelPullerInput" class="model-puller-input" placeholder="e.g., llama3.1:latest, mistral:7b, qwen2.5:14b">
                                        <button type="button" class="model-puller-clear-btn" id="clearInputBtn" title="Clear input">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    </div>
                                    <small class="model-puller-help">Enter exact model name with optional tag (e.g., modelname:tag)</small>
                                </div>
                            </form>
                        </div>

                        <!-- Download Progress -->
                        <div id="pullProgress" class="model-puller-progress-container" style="display: none;">
                            <div class="model-puller-progress-header">
                                <h4 id="progressTitle">Pulling Model</h4>
                                <div class="model-puller-progress-controls">
                                    <button type="button" class="model-puller-btn model-puller-btn-warning model-puller-btn-sm" id="pauseDownloadBtn">
                                        <i class="fas fa-pause"></i>
                                        Pause
                                    </button>
                                    <button type="button" class="model-puller-btn model-puller-btn-danger model-puller-btn-sm" id="cancelDownloadBtn">
                                        <i class="fas fa-times"></i>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                            <div class="model-puller-progress-bar">
                                <div class="model-puller-progress-fill" id="pullProgressFill"></div>
                            </div>
                            <div class="model-puller-progress-details">
                                <div class="model-puller-progress-text" id="pullProgressText">Starting download...</div>
                                <div class="model-puller-download-stats" id="downloadStats" style="display: none;">
                                    <span class="model-puller-stat-item">
                                        <i class="fas fa-tachometer-alt"></i>
                                        <span id="downloadSpeed">0 MB/s</span>
                                    </span>
                                    <span class="model-puller-stat-item">
                                        <i class="fas fa-download"></i>
                                        <span id="downloadSize">0 MB / 0 MB</span>
                                    </span>
                                    <span class="model-puller-stat-item">
                                        <i class="fas fa-clock"></i>
                                        <span id="downloadETA">Calculating...</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="model-puller-footer">
                        <button type="button" class="model-puller-btn model-puller-btn-secondary" id="modelPullerCancel">Close</button>
                        <button type="submit" form="modelPullerForm" class="model-puller-btn model-puller-btn-primary" id="modelPullerSubmit">
                            <i class="fas fa-download"></i>
                            Pull Model
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    setupEventListeners() {
        const modal = document.getElementById(this.containerId);
        if (!modal) return;

        // Close button
        const closeBtn = modal.querySelector('.model-puller-close');
        const cancelBtn = modal.querySelector('#modelPullerCancel');
        
        [closeBtn, cancelBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.close());
            }
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close();
            }
        });

        // Direct input handling
        const modelInput = modal.querySelector('#modelPullerInput');
        const clearInputBtn = modal.querySelector('#clearInputBtn');
        
        if (modelInput) {
            modelInput.addEventListener('input', () => {
                this.updatePullButton();
                // Clear model selector when typing in direct input
                if (modelInput.value.trim() && this.modelSelector) {
                    this.modelSelector.clearSelection();
                    this.selectedModel = null;
                }
            });
        }
        
        if (clearInputBtn) {
            clearInputBtn.addEventListener('click', () => {
                if (modelInput) {
                    modelInput.value = '';
                    this.updatePullButton();
                }
            });
        }



        // Form submission
        const form = modal.querySelector('#modelPullerForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.pullModel();
            });
        }

        // Download controls
        const pauseBtn = modal.querySelector('#pauseDownloadBtn');
        const cancelDownloadBtn = modal.querySelector('#cancelDownloadBtn');
        
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.pauseDownload());
        }
        
        if (cancelDownloadBtn) {
            cancelDownloadBtn.addEventListener('click', () => this.cancelDownload());
        }
    }

    setupWebSocketListeners() {
        if (!this.wsService) return;

        this.wsService.on('model_pull_progress', (data) => {
            this.handleModelPullProgress(data);
        });
        
        this.wsService.on('model_pull_completed', (data) => {
            this.handleModelPullCompleted(data);
        });
        
        this.wsService.on('model_pull_error', (data) => {
            this.handleModelPullError(data);
        });
    }

    updatePullButton() {
        const submitBtn = document.getElementById('modelPullerSubmit');
        const modelInput = document.getElementById('modelPullerInput');
        
        if (!submitBtn) return;
        
        const hasSelection = this.selectedModel || (modelInput && modelInput.value.trim());
        submitBtn.disabled = !hasSelection || this.isPullingModel;
        
        if (this.selectedModel) {
            submitBtn.innerHTML = `<i class="fas fa-download"></i> Pull ${this.selectedModel}`;
        } else if (modelInput && modelInput.value.trim()) {
            submitBtn.innerHTML = `<i class="fas fa-download"></i> Pull ${modelInput.value.trim()}`;
        } else {
            submitBtn.innerHTML = `<i class="fas fa-download"></i> Pull Model`;
        }
    }

    // Legacy methods removed - using ModelSelector instead

    async pullModel() {
        // Get model name from either the selector or direct input
        const modelInput = document.getElementById('modelPullerInput');
        const modelName = this.selectedModel || (modelInput ? modelInput.value.trim() : '');
        
        if (!modelName) {
            this.toastManager.show('Please select a model or enter a model name', 'error');
            return;
        }

        if (this.isPullingModel) {
            this.toastManager.show('A model is already being pulled', 'warning');
            return;
        }
        
        try {
            this.isPullingModel = true;
            this.setButtonLoading('modelPullerSubmit', true);
            
            // Check Ollama service health before attempting to pull
            this.toastManager.show('Checking Ollama service status...', 'info');
            const healthCheck = await this.apiService.checkOllamaHealth();
            
            if (!healthCheck.connected) {
                throw new Error('Ollama service is not running. Please start Ollama service first.');
            }
            
            this.showPullProgress(modelName);
            
            const result = await this.apiService.pullModel(modelName);
            
            if (result.success) {
                // Use the downloadId from the server response
                this.currentDownloadId = result.downloadId || Date.now().toString();
                console.log('Started model pull with downloadId:', this.currentDownloadId);
                this.toastManager.show(`Started pulling model: ${modelName}`, 'info');
            } else {
                throw new Error(result.error || 'Failed to start model pull');
            }
        } catch (error) {
            console.error('Error pulling model:', error);
            
            // Provide specific guidance based on error type
            if (error.message.includes('not running') || error.message.includes('not available')) {
                this.toastManager.show(
                    'Ollama service is not running. Please go to the Models page and start the Ollama service first.', 
                    'error'
                );
                
                // Show helpful modal with instructions
                this.showOllamaNotRunningModal();
            } else {
                this.toastManager.show('Failed to start model pull: ' + error.message, 'error');
            }
            
            this.isPullingModel = false;
            this.setButtonLoading('modelPullerSubmit', false);
            this.hidePullProgress();
        }
    }

    showOllamaNotRunningModal() {
        // Create a helpful modal with instructions
        const instructionModal = document.createElement('div');
        instructionModal.className = 'model-puller-modal';
        instructionModal.style.zIndex = '1001'; // Higher than main modal
        instructionModal.innerHTML = `
            <div class="model-puller-content" style="max-width: 500px;">
                <div class="model-puller-header">
                    <h2>Ollama Service Required</h2>
                    <button class="model-puller-close" onclick="this.closest('.model-puller-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="model-puller-body">
                    <div class="model-puller-error" style="margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Ollama service is not running</strong>
                    </div>
                    <p>To pull models, you need to start the Ollama service first. Here's how:</p>
                    <ol style="margin: 1rem 0; padding-left: 1.5rem;">
                        <li>Go to the <strong>Models</strong> page</li>
                        <li>Check the <strong>Ollama Service Management</strong> section</li>
                        <li>Click the <strong>"Start Ollama"</strong> button</li>
                        <li>Wait for the service to start (status should show "Connected")</li>
                        <li>Return here to pull models</li>
                    </ol>
                    <p><strong>Note:</strong> If Ollama is not installed, you'll need to install it first using the "Install Ollama" button.</p>
                </div>
                <div class="model-puller-footer">
                    <button type="button" class="model-puller-btn model-puller-btn-secondary" onclick="this.closest('.model-puller-modal').remove()">
                        Got it
                    </button>
                    <button type="button" class="model-puller-btn model-puller-btn-primary" onclick="window.location.href='../models/models.html'">
                        Go to Models Page
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(instructionModal);
        instructionModal.style.display = 'flex';
        
        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (instructionModal.parentNode) {
                instructionModal.remove();
            }
        }, 30000);
    }

    showPullProgress(modelName) {
        const progressContainer = document.getElementById('pullProgress');
        const progressTitle = document.getElementById('progressTitle');
        const progressText = document.getElementById('pullProgressText');
        const progressFill = document.getElementById('pullProgressFill');
        const downloadStats = document.getElementById('downloadStats');
        
        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressContainer.classList.remove('paused', 'cancelled');
            
            if (progressTitle) progressTitle.textContent = `Pulling ${modelName}`;
            if (progressFill) progressFill.style.width = '0%';
            if (progressText) progressText.textContent = 'Initializing download...';
            if (downloadStats) downloadStats.style.display = 'none';
        }
    }

    hidePullProgress() {
        const progressContainer = document.getElementById('pullProgress');
        if (progressContainer) {
            progressContainer.style.display = 'none';
            progressContainer.classList.remove('paused', 'cancelled');
        }
    }

    async pauseDownload() {
        if (!this.isPullingModel || !this.currentDownloadId) return;
        
        try {
            const result = await this.apiService.pauseModelPull(this.currentDownloadId);
            
            if (result.success) {
                const progressContainer = document.getElementById('pullProgress');
                const progressText = document.getElementById('pullProgressText');
                const pauseBtn = document.getElementById('pauseDownloadBtn');
                
                if (progressContainer) progressContainer.classList.add('paused');
                if (progressText) {
                    progressText.textContent = 'Pause requested - Ollama downloads continue in background';
                }
                
                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fas fa-info-circle"></i> Paused';
                    pauseBtn.disabled = true;
                    pauseBtn.title = 'Ollama does not support native pause functionality';
                }
                
                this.toastManager.show('Pause requested - Ollama downloads cannot be paused natively', 'warning');
                
                // Show info about Ollama limitations
                this.showOllamaLimitationInfo('pause');
            }
        } catch (error) {
            console.error('Failed to pause download:', error);
            this.toastManager.show('Failed to request pause', 'error');
        }
    }

    async resumeDownload() {
        if (!this.currentDownloadId) return;
        
        try {
            const result = await this.apiService.resumeModelPull(this.currentDownloadId);
            
            if (result.success) {
                const progressContainer = document.getElementById('pullProgress');
                const progressText = document.getElementById('pullProgressText');
                const pauseBtn = document.getElementById('pauseDownloadBtn');
                
                if (progressContainer) progressContainer.classList.remove('paused');
                if (progressText) progressText.textContent = 'Download continuing...';
                
                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
                    pauseBtn.disabled = false;
                    pauseBtn.title = '';
                    pauseBtn.onclick = () => this.pauseDownload();
                }
                
                this.toastManager.show('Download continuing', 'info');
            }
        } catch (error) {
            console.error('Failed to resume download:', error);
            this.toastManager.show('Failed to resume download', 'error');
        }
    }

    async cancelDownload() {
        if (!this.isPullingModel || !this.currentDownloadId) return;
        
        const confirmed = confirm('Are you sure you want to cancel this download? Note: Ollama downloads cannot be cancelled natively and may continue in the background.');
        if (!confirmed) return;
        
        try {
            const result = await this.apiService.cancelModelPull(this.currentDownloadId);
            
            if (result.success) {
                const progressContainer = document.getElementById('pullProgress');
                const progressText = document.getElementById('pullProgressText');
                
                if (progressContainer) progressContainer.classList.add('cancelled');
                if (progressText) {
                    progressText.textContent = 'Cancellation requested - download may continue in background';
                }
                
                this.toastManager.show('Cancellation requested - Ollama downloads cannot be stopped natively', 'warning');
                
                // Show info about Ollama limitations
                this.showOllamaLimitationInfo('cancel');
                
                setTimeout(() => {
                    this.hidePullProgress();
                    this.isPullingModel = false;
                    this.currentDownloadId = null;
                    this.setButtonLoading('modelPullerSubmit', false);
                }, 3000);
            }
        } catch (error) {
            console.error('Failed to cancel download:', error);
            this.toastManager.show('Failed to request cancellation', 'error');
        }
    }

    showOllamaLimitationInfo(action) {
        // Create an informational modal about Ollama limitations
        const infoModal = document.createElement('div');
        infoModal.className = 'model-puller-modal';
        infoModal.style.zIndex = '1002'; // Higher than other modals
        
        const actionText = action === 'pause' ? 'pause' : 'cancel';
        const actionDescription = action === 'pause' 
            ? 'pause and resume downloads' 
            : 'cancel downloads once started';
        
        infoModal.innerHTML = `
            <div class="model-puller-content" style="max-width: 500px;">
                <div class="model-puller-header">
                    <h2>Ollama Limitation</h2>
                    <button class="model-puller-close" onclick="this.closest('.model-puller-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="model-puller-body">
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <i class="fas fa-info-circle" style="font-size: 3rem; color: #3b82f6; margin-bottom: 1rem;"></i>
                    </div>
                    <h3 style="text-align: center; margin-bottom: 1rem; color: #374151;">About Ollama Downloads</h3>
                    <p style="margin-bottom: 1rem; line-height: 1.6;">
                        Ollama does not natively support the ability to <strong>${actionDescription}</strong>. 
                        When you start downloading a model, it will continue until completion.
                    </p>
                    <div style="background: #f3f4f6; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                        <h4 style="margin: 0 0 0.5rem; color: #374151;">
                            <i class="fas fa-lightbulb" style="color: #f59e0b;"></i>
                            What you can do:
                        </h4>
                        <ul style="margin: 0; padding-left: 1.5rem; line-height: 1.6;">
                            <li>Wait for the download to complete naturally</li>
                            <li>Restart the Ollama service to stop all downloads</li>
                            <li>Close this interface - downloads continue in background</li>
                        </ul>
                    </div>
                    <p style="margin: 1rem 0 0; font-size: 0.9rem; color: #6b7280;">
                        <strong>Note:</strong> This is a limitation of Ollama itself, not this interface.
                    </p>
                </div>
                <div class="model-puller-footer">
                    <button type="button" class="model-puller-btn model-puller-btn-secondary" onclick="this.closest('.model-puller-modal').remove()">
                        I Understand
                    </button>
                    ${action === 'cancel' ? `
                        <button type="button" class="model-puller-btn model-puller-btn-warning" onclick="window.location.href='../models/models.html'">
                            <i class="fas fa-redo"></i>
                            Restart Ollama Service
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(infoModal);
        infoModal.style.display = 'flex';
        
        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (infoModal.parentNode) {
                infoModal.remove();
            }
        }, 15000);
    }

    handleModelPullProgress(data) {
        // console.log('Received progress data:', data);
        
        // Check if this progress update is for our current download
        if (!this.isPullingModel || (data.downloadId && data.downloadId !== this.currentDownloadId)) {
            console.log('Ignoring progress - not our download or not pulling');
            return;
        }
        
        const progressContainer = document.getElementById('pullProgress');
        const progressFill = document.getElementById('pullProgressFill');
        const progressText = document.getElementById('pullProgressText');
        const downloadStats = document.getElementById('downloadStats');
        const downloadSpeed = document.getElementById('downloadSpeed');
        const downloadSize = document.getElementById('downloadSize');
        const downloadETA = document.getElementById('downloadETA');
        
        if (!progressContainer) return;

        // Handle Ollama progress format
        const progress = data.progress || {};
        const modelName = data.modelName || 'model';
        
        // Update progress text based on status
        if (progress.status) {
            let statusText = progress.status;
            if (progress.status === 'pulling manifest') {
                statusText = 'Downloading manifest...';
            } else if (progress.status === 'downloading') {
                statusText = 'Downloading model...';
            } else if (progress.status === 'verifying sha256 digest') {
                statusText = 'Verifying download...';
            } else if (progress.status === 'writing manifest') {
                statusText = 'Writing manifest...';
            } else if (progress.status === 'removing any unused layers') {
                statusText = 'Cleaning up...';
            } else if (progress.status === 'success') {
                statusText = 'Download completed!';
            }
            
            if (progressText) {
                progressText.textContent = `${statusText}`;
            }
        }

        // Update progress bar if we have completion data
        if (progress.completed !== undefined && progress.total !== undefined && progress.total > 0) {
            const percentage = (progress.completed / progress.total) * 100;
            if (progressFill) progressFill.style.width = `${percentage}%`;
            if (progressText) {
                progressText.textContent = `Pulling ${modelName}... ${Math.round(percentage)}%`;
            }
            
            // Show download statistics
            if (downloadStats) {
                downloadStats.style.display = 'flex';
                
                if (downloadSize) {
                    const downloaded = this.formatBytes(progress.completed);
                    const total = this.formatBytes(progress.total);
                    downloadSize.textContent = `${downloaded} / ${total}`;
                }
                
                // Calculate speed if we have timing data
                if (downloadSpeed && progress.completed > 0) {
                    // This is a rough estimate - Ollama doesn't provide speed directly
                    downloadSpeed.textContent = 'Downloading...';
                }
                
                if (downloadETA) {
                    downloadETA.textContent = 'Calculating...';
                }
            }
        } else {
            // No specific progress data, just show status
            if (progressText && progress.status) {
                progressText.textContent = `${progress.status}...`;
            } else if (progressText) {
                progressText.textContent = `Pulling ${modelName}...`;
            }
        }
    }

    handleModelPullCompleted(data) {
        console.log('Received completion data:', data);
        
        // Check if this completion is for our current download
        if (data.downloadId && data.downloadId !== this.currentDownloadId) {
            console.log('Ignoring completion - not our download');
            return;
        }
        
        this.toastManager.show(`Model ${data.modelName} pulled successfully!`, 'success');
        this.close();
        this.onModelPulled(data.modelName);
        this.isPullingModel = false;
        this.currentDownloadId = null;
        this.setButtonLoading('modelPullerSubmit', false);
    }

    handleModelPullError(data) {
        console.log('Received error data:', data);
        
        // Check if this error is for our current download
        if (data.downloadId && data.downloadId !== this.currentDownloadId) {
            console.log('Ignoring error - not our download');
            return;
        }
        
        // Provide specific guidance based on error type
        let errorMessage = `Failed to pull model: ${data.error}`;
        let isRetryable = false;
        
        if (data.error.includes('file does not exist')) {
            errorMessage = 'Model manifest not found. This could be due to:';
            this.showModelNotFoundGuidance(data.modelName, data.error);
            isRetryable = true;
        } else if (data.error.includes('max retries exceeded') || data.error.includes('unexpected EOF')) {
            errorMessage = 'Network connection interrupted. You can retry the download.';
            this.showNetworkErrorGuidance(data.modelName, data.error);
            isRetryable = true;
        } else if (data.error.includes('no such host') || data.error.includes('lookup')) {
            errorMessage = 'DNS resolution failed. Check your internet connection.';
            this.showDNSErrorGuidance(data.modelName, data.error);
            isRetryable = true;
        } else {
            this.toastManager.show(errorMessage, 'error');
        }
        
        this.isPullingModel = false;
        this.currentDownloadId = null;
        this.setButtonLoading('modelPullerSubmit', false);
        this.hidePullProgress();
        
        // Show retry option for retryable errors
        if (isRetryable) {
            this.showRetryOption(data.modelName);
        }
    }

    showModelNotFoundGuidance(modelName, error) {
        const modalBody = document.querySelector(`#${this.containerId} .model-puller-body`);
        if (!modalBody) return;

        this.removeExistingErrorGuidance();

        const guidance = document.createElement('div');
        guidance.className = 'error-guidance model-puller-error';
        guidance.innerHTML = `
            <div class="error-guidance-header">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Model Not Found: ${modelName}</strong>
            </div>
            <div class="error-guidance-content">
                <p>The model manifest could not be found. This usually happens because:</p>
                <ul>
                    <li><strong>Incorrect model name:</strong> Check the exact model name and tag</li>
                    <li><strong>Model doesn't exist:</strong> The model may not be available in the Ollama registry</li>
                    <li><strong>Network issues:</strong> Temporary connectivity problems</li>
                    <li><strong>Registry issues:</strong> Temporary problems with Ollama's servers</li>
                </ul>
                <div class="error-suggestions">
                    <p><strong>Suggestions:</strong></p>
                    <ul>
                        <li>Try using <code>llama3.2:3b</code> instead of <code>meta-llama/Llama-3.2-3B</code></li>
                        <li>Check available models in the <strong>Model Selector</strong> above</li>
                        <li>Verify the model name at <a href="https://ollama.ai/library" target="_blank">Ollama Library</a></li>
                        <li>Wait a few minutes and retry</li>
                    </ul>
                </div>
                <div class="error-technical">
                    <details>
                        <summary>Technical Details</summary>
                        <code>${error}</code>
                    </details>
                </div>
            </div>
        `;

        modalBody.insertBefore(guidance, modalBody.firstChild);
    }

    showNetworkErrorGuidance(modelName, error) {
        const modalBody = document.querySelector(`#${this.containerId} .model-puller-body`);
        if (!modalBody) return;

        this.removeExistingErrorGuidance();

        const guidance = document.createElement('div');
        guidance.className = 'error-guidance model-puller-warning';
        guidance.innerHTML = `
            <div class="error-guidance-header">
                <i class="fas fa-wifi"></i>
                <strong>Network Connection Interrupted</strong>
            </div>
            <div class="error-guidance-content">
                <p>The download was interrupted due to network issues. Ollama will try to resume from where it left off.</p>
                <div class="error-suggestions">
                    <p><strong>What to do:</strong></p>
                    <ul>
                        <li>Check your internet connection stability</li>
                        <li>Retry the download - it should resume automatically</li>
                        <li>Consider downloading during off-peak hours</li>
                        <li>If problems persist, restart Ollama service</li>
                    </ul>
                </div>
                <div class="error-technical">
                    <details>
                        <summary>Technical Details</summary>
                        <code>${error}</code>
                    </details>
                </div>
            </div>
        `;

        modalBody.insertBefore(guidance, modalBody.firstChild);
    }

    showDNSErrorGuidance(modelName, error) {
        const modalBody = document.querySelector(`#${this.containerId} .model-puller-body`);
        if (!modalBody) return;

        this.removeExistingErrorGuidance();

        const guidance = document.createElement('div');
        guidance.className = 'error-guidance model-puller-error';
        guidance.innerHTML = `
            <div class="error-guidance-header">
                <i class="fas fa-globe"></i>
                <strong>DNS Resolution Failed</strong>
            </div>
            <div class="error-guidance-content">
                <p>Cannot resolve Ollama's download servers. This is usually a network configuration issue.</p>
                <div class="error-suggestions">
                    <p><strong>Troubleshooting steps:</strong></p>
                    <ul>
                        <li>Check your internet connection</li>
                        <li>Try using a different DNS server (e.g., 8.8.8.8, 1.1.1.1)</li>
                        <li>Restart your network adapter</li>
                        <li>Try again with a VPN if behind corporate firewall</li>
                        <li>Wait and retry - may be temporary DNS issues</li>
                    </ul>
                </div>
                <div class="error-technical">
                    <details>
                        <summary>Technical Details</summary>
                        <code>${error}</code>
                    </details>
                </div>
            </div>
        `;

        modalBody.insertBefore(guidance, modalBody.firstChild);
    }

    showRetryOption(modelName) {
        const modalBody = document.querySelector(`#${this.containerId} .model-puller-body`);
        if (!modalBody) return;

        // Add retry button to existing guidance
        const guidance = modalBody.querySelector('.error-guidance');
        if (guidance) {
            const retrySection = document.createElement('div');
            retrySection.className = 'error-retry-section';
            retrySection.innerHTML = `
                <button type="button" class="model-puller-btn model-puller-btn-primary model-puller-btn-sm retry-download-btn" 
                        onclick="window.modelPullerInstance?.retryLastDownload()">
                    <i class="fas fa-redo"></i>
                    Retry Download
                </button>
                <button type="button" class="model-puller-btn model-puller-btn-secondary model-puller-btn-sm" 
                        onclick="window.modelPullerInstance?.clearErrorGuidance()">
                    <i class="fas fa-times"></i>
                    Dismiss
                </button>
            `;
            guidance.appendChild(retrySection);
        }
    }

    retryLastDownload() {
        // Get the last attempted model name
        const modelInput = document.getElementById('modelPullerInput');
        const modelName = this.selectedModel || (modelInput ? modelInput.value.trim() : '');
        
        if (modelName) {
            this.clearErrorGuidance();
            this.pullModel();
        }
    }

    removeExistingErrorGuidance() {
        const existingGuidance = document.querySelector(`#${this.containerId} .error-guidance`);
        if (existingGuidance) {
            existingGuidance.remove();
        }
    }

    clearErrorGuidance() {
        this.removeExistingErrorGuidance();
    }

    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    // Mock data functions (replace with actual API calls)
    async getPopularModels() {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return [
            {
                name: 'llama3.1:latest',
                description: 'Meta\'s latest large language model with 8B parameters',
                downloads: 2500000,
                size: '4.7GB',
                updated: new Date('2024-05-15')
            },
            {
                name: 'mistral:latest',
                description: 'Mistral AI\'s efficient 7B parameter model',
                downloads: 1800000,
                size: '4.1GB',
                updated: new Date('2024-05-10')
            },
            {
                name: 'codellama:latest',
                description: 'Code-specialized version of Llama for programming tasks',
                downloads: 1200000,
                size: '3.8GB',
                updated: new Date('2024-05-08')
            },
            {
                name: 'phi3:latest',
                description: 'Microsoft\'s compact yet powerful 3.8B parameter model',
                downloads: 950000,
                size: '2.3GB',
                updated: new Date('2024-05-12')
            },
            {
                name: 'gemma:latest',
                description: 'Google\'s open-source language model family',
                downloads: 800000,
                size: '5.2GB',
                updated: new Date('2024-05-05')
            }
        ];
    }

    async getLatestModels() {
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        return [
            {
                name: 'qwen2:latest',
                description: 'Alibaba\'s latest multilingual language model',
                downloads: 450000,
                size: '4.5GB',
                updated: new Date('2024-05-20')
            },
            {
                name: 'llama3.1:8b-instruct',
                description: 'Instruction-tuned version of Llama 3.1 8B',
                downloads: 380000,
                size: '4.7GB',
                updated: new Date('2024-05-18')
            },
            {
                name: 'mistral:7b-instruct',
                description: 'Instruction-following variant of Mistral 7B',
                downloads: 320000,
                size: '4.1GB',
                updated: new Date('2024-05-16')
            },
            {
                name: 'deepseek-coder:latest',
                description: 'Specialized coding model with strong programming capabilities',
                downloads: 280000,
                size: '3.9GB',
                updated: new Date('2024-05-14')
            },
            {
                name: 'neural-chat:latest',
                description: 'Optimized for conversational AI applications',
                downloads: 220000,
                size: '3.5GB',
                updated: new Date('2024-05-13')
            }
        ];
    }

    async performModelSearch(query) {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const allModels = [
            ...(await this.getPopularModels()),
            ...(await this.getLatestModels()),
            {
                name: 'vicuna:latest',
                description: 'Open-source chatbot trained by fine-tuning LLaMA',
                downloads: 650000,
                size: '4.2GB',
                updated: new Date('2024-05-01')
            },
            {
                name: 'alpaca:latest',
                description: 'Stanford\'s instruction-following language model',
                downloads: 580000,
                size: '3.7GB',
                updated: new Date('2024-04-28')
            }
        ];
        
        return allModels.filter(model => 
            model.name.toLowerCase().includes(query.toLowerCase()) ||
            model.description.toLowerCase().includes(query.toLowerCase())
        );
    }

    // Utility functions
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(new Date(date));
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        if (!seconds || seconds === Infinity) return 'Unknown';
        
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    // Public API
    async show() {
        const modal = document.getElementById(this.containerId);
        if (modal) {
            modal.style.display = 'flex';
            this.isVisible = true;
            
            // Reset any previous state
            this.resetState();
            
            // Update pull button state
            this.updatePullButton();
            
            // Check Ollama service status first
            await this.checkOllamaServiceStatus();
            
            // Focus on the direct input field
            const modelInput = document.getElementById('modelPullerInput');
            if (modelInput) {
                setTimeout(() => modelInput.focus(), 100);
            }
        }
    }

    async checkOllamaServiceStatus() {
        try {
            const healthCheck = await this.apiService.checkOllamaHealth();
            this.updateServiceStatusUI(healthCheck);
        } catch (error) {
            console.error('Failed to check Ollama service status:', error);
            this.updateServiceStatusUI({ connected: false, error: error.message });
        }
    }

    updateServiceStatusUI(healthStatus) {
        // Add service status indicator to the modal header
        const header = document.querySelector(`#${this.containerId} .model-puller-header`);
        if (!header) return;

        // Remove existing status indicator
        const existingStatus = header.querySelector('.service-status-indicator');
        if (existingStatus) {
            existingStatus.remove();
        }

        // Create new status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'service-status-indicator';
        
        if (healthStatus.connected) {
            statusIndicator.innerHTML = `
                <div class="status-badge status-connected">
                    <i class="fas fa-circle"></i>
                    <span>Ollama Connected</span>
                </div>
                <button type="button" class="model-puller-btn model-puller-btn-secondary model-puller-btn-sm" onclick="window.modelPullerInstance.refreshServiceStatus()" title="Refresh service status">
                    <i class="fas fa-sync-alt"></i>
                </button>
            `;
        } else {
            statusIndicator.innerHTML = `
                <div class="status-badge status-disconnected">
                    <i class="fas fa-circle"></i>
                    <span>Ollama Disconnected</span>
                </div>
                <button type="button" class="model-puller-btn model-puller-btn-secondary model-puller-btn-sm" onclick="window.modelPullerInstance.refreshServiceStatus()" title="Refresh service status">
                    <i class="fas fa-sync-alt"></i>
                </button>
            `;
            
            // Show warning message in the modal body
            this.showServiceWarning();
        }

        // Insert status indicator after the title
        const title = header.querySelector('h2');
        if (title) {
            title.insertAdjacentElement('afterend', statusIndicator);
        }

        // Update pull button state
        const pullButton = document.getElementById('modelPullerSubmit');
        if (pullButton) {
            pullButton.disabled = !healthStatus.connected;
            if (!healthStatus.connected) {
                pullButton.title = 'Ollama service must be running to pull models';
            } else {
                pullButton.title = '';
            }
        }
    }

    async refreshServiceStatus() {
        // Show loading state
        const refreshBtn = document.querySelector(`#${this.containerId} .service-status-indicator .model-puller-btn`);
        if (refreshBtn) {
            const originalContent = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            refreshBtn.disabled = true;
            
            try {
                await this.checkOllamaServiceStatus();
                this.toastManager.show('Service status refreshed', 'success');
            } catch (error) {
                this.toastManager.show('Failed to refresh service status', 'error');
            } finally {
                // Restore button (it will be replaced by updateServiceStatusUI anyway)
                setTimeout(() => {
                    if (refreshBtn && refreshBtn.parentNode) {
                        refreshBtn.innerHTML = originalContent;
                        refreshBtn.disabled = false;
                    }
                }, 500);
            }
        }
    }

    showServiceWarning() {
        const modalBody = document.querySelector(`#${this.containerId} .model-puller-body`);
        if (!modalBody) return;

        // Remove existing warning
        const existingWarning = modalBody.querySelector('.service-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        // Create warning message
        const warning = document.createElement('div');
        warning.className = 'service-warning model-puller-error';
        warning.style.marginBottom = '1rem';
        warning.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Ollama Service Not Available</strong>
            <p>The Ollama service is not running. You need to start it before pulling models.</p>
            <button type="button" class="model-puller-btn model-puller-btn-primary model-puller-btn-sm" onclick="window.location.href='../models/models.html'">
                <i class="fas fa-external-link-alt"></i>
                Go to Models Page
            </button>
        `;

        // Insert warning at the top of modal body
        modalBody.insertBefore(warning, modalBody.firstChild);
    }

    close() {
        const modal = document.getElementById(this.containerId);
        if (modal) {
            modal.style.display = 'none';
            this.isVisible = false;
            this.resetState();
            this.onClose();
        }
    }

    resetState() {
        // Reset form
        const form = document.getElementById('modelPullerForm');
        if (form) form.reset();
        
        // Reset model selection
        this.selectedModel = null;
        if (this.modelSelector) {
            this.modelSelector.clearSelection();
        }
        
        // Hide progress
        this.hidePullProgress();
        
        // Reset download state
        this.isPullingModel = false;
        this.currentDownloadId = null;
        this.setButtonLoading('modelPullerSubmit', false);
        
        // Remove service warning
        const serviceWarning = document.querySelector(`#${this.containerId} .service-warning`);
        if (serviceWarning) {
            serviceWarning.remove();
        }
        
        // Clear error guidance
        this.clearErrorGuidance();
    }

    destroy() {
        const modal = document.getElementById(this.containerId);
        if (modal) {
            modal.remove();
        }
    }
}

// Global instance for onclick handlers
window.modelPullerInstance = null; 