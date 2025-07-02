export class ApiService {
    constructor() {
        this.baseURL = '/api';
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // Discussion endpoints
    async getDiscussions() {
        return this.request('/discussions');
    }

    async getDiscussion(id) {
        return this.request(`/discussions/${id}`);
    }

    async createDiscussion(data) {
        return this.request('/discussions', {
            method: 'POST',
            body: data
        });
    }

    async startDiscussion(id) {
        return this.request(`/discussions/${id}/start`, {
            method: 'POST'
        });
    }

    async stopDiscussion(id) {
        return this.request(`/discussions/${id}/stop`, {
            method: 'POST'
        });
    }

    async deleteDiscussion(id) {
        return this.request(`/discussions/${id}`, {
            method: 'DELETE'
        });
    }

    async getDiscussionMessages(id, page = 1, limit = 50) {
        return this.request(`/discussions/${id}/messages?page=${page}&limit=${limit}`);
    }

    async getDiscussionSummary(id) {
        return this.request(`/discussions/${id}/summary`);
    }

    async getDiscussionStats() {
        return this.request('/discussions/stats/overview');
    }

    async downloadDiscussion(id, format = 'json') {
        const url = `${this.baseURL}/discussions/${id}/export?format=${format}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `discussion_export_${new Date().toISOString().split('T')[0]}.${format}`;
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            // Get the content
            let content;
            if (format === 'json') {
                content = await response.json();
                content = JSON.stringify(content, null, 2);
            } else {
                content = await response.text();
            }

            // Create and trigger download
            const blob = new Blob([content], { 
                type: format === 'json' ? 'application/json' : 'text/plain' 
            });
            const downloadUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            window.URL.revokeObjectURL(downloadUrl);
            
            return { success: true, filename };
        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
    }

    // Model endpoints
    async getModels() {
        const response = await this.request('/models');
        return response;
    }

    async getRunningModels() {
        const response = await this.request('/models/running');
        return response.data || [];
    }

    async getModelInfo(name) {
        const response = await this.request(`/models/${encodeURIComponent(name)}`);
        return response.data;
    }

    async pullModel(modelName) {
        return this.request('/models/pull', {
            method: 'POST',
            body: { modelName }
        });
    }

    async pauseModelPull(downloadId) {
        return this.request('/models/pull/pause', {
            method: 'POST',
            body: { downloadId }
        });
    }

    async resumeModelPull(downloadId) {
        return this.request('/models/pull/resume', {
            method: 'POST',
            body: { downloadId }
        });
    }

    async cancelModelPull(downloadId) {
        return this.request('/models/pull/cancel', {
            method: 'POST',
            body: { downloadId }
        });
    }

    async deleteModel(name) {
        return this.request(`/models/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
    }

    async testModel(modelName, prompt = 'hi') {
        return this.request('/models/test', {
            method: 'POST',
            body: { modelName, prompt }
        });
    }

    async checkOllamaHealth() {
        const response = await this.request('/models/health');
        console.log('[API] Health check response:', response);
        return response.data;
    }

    // Ollama service management
    async checkOllamaInstallation() {
        const response = await this.request('/models/ollama/check-installation');
        console.log('[API] Installation check response:', response);
        return response;
    }

    async getOllamaVersion() {
        return await this.request('/models/ollama/version');
    }

    async installOllama(githubToken = null) {
        const body = {};
        if (githubToken) {
            body.githubToken = githubToken;
        }
        
        return this.request('/models/ollama/install', {
            method: 'POST',
            body
        });
    }

    async startOllama() {
        return this.request('/models/ollama/start', {
            method: 'POST'
        });
    }

    async stopOllama() {
        return this.request('/models/ollama/stop', {
            method: 'POST'
        });
    }

    async restartOllama() {
        return this.request('/models/ollama/restart', {
            method: 'POST'
        });
    }

    async updateOllama() {
        return this.request('/models/ollama/update', {
            method: 'POST'
        });
    }

    async uninstallOllama() {
        return this.request('/models/ollama/uninstall', {
            method: 'POST'
        });
    }

    // Chat endpoints
    async chat(modelName, messages, providerId = null) {
        return this.request('/chat', {
            method: 'POST',
            body: { modelName, messages, providerId }
        });
    }

    async chatStream(modelName, messages, onChunk, providerId = null) {
        const url = `${this.baseURL}/chat/stream`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ modelName, messages, providerId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() && line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (onChunk) {
                                onChunk(data);
                            }
                        } catch (e) {
                            console.warn('Failed to parse streaming chunk:', line);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // GPU configuration endpoints
    async getGPUConfig() {
        return this.request('/gpu/config');
    }

    async updateGPUConfig(config) {
        return this.request('/gpu/config', {
            method: 'POST',
            body: config
        });
    }

    async detectGPUs() {
        return this.request('/gpu/detect');
    }

    async resetGPUConfig() {
        return this.request('/gpu/reset', {
            method: 'POST'
        });
    }

    async getGPUOptions() {
        return this.request('/gpu/options');
    }

    // Health check
    async checkHealth() {
        return this.request('/health');
    }

    // Download control methods
    async pauseDownload() {
        return await this.request('/models/ollama/download/pause', {
            method: 'POST'
        });
    }

    async resumeDownload() {
        return await this.request('/models/ollama/download/resume', {
            method: 'POST'
        });
    }

    async cancelDownload() {
        return await this.request('/models/ollama/download/cancel', {
            method: 'POST'
        });
    }

    async getDownloadStatus() {
        return await this.request('/models/ollama/download/status');
    }

    // Model parameters endpoints
    async getModelParameters() {
        return this.request('/settings/model-parameters');
    }

    async updateModelParameters(parameters) {
        return this.request('/settings/model-parameters', {
            method: 'POST',
            body: parameters
        });
    }

    // Storage Management Methods
    async getStorageInfo() {
        return this.request('/discussions/storage/info');
    }

    async createBackup() {
        return this.request('/discussions/storage/backup', {
            method: 'POST'
        });
    }

    async cleanupStorage() {
        return this.request('/discussions/storage/cleanup', {
            method: 'POST'
        });
    }

    // Chat Management Methods
    async createChat(model, title = null) {
        return this.request('/chat/create', {
            method: 'POST',
            body: JSON.stringify({ model, title })
        });
    }

    async getChats() {
        return this.request('/chat');
    }

    async getChat(chatId) {
        return this.request(`/chat/${chatId}`);
    }

    async addChatMessage(chatId, role, content) {
        return this.request(`/chat/${chatId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ role, content })
        });
    }

    async updateChatMessage(chatId, messageId, content) {
        return this.request(`/chat/${chatId}/messages/${messageId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    }

    async deleteChat(chatId) {
        return this.request(`/chat/${chatId}`, {
            method: 'DELETE'
        });
    }

    async deactivateChat(chatId) {
        return this.request(`/chat/${chatId}/deactivate`, {
            method: 'POST'
        });
    }

    async exportChat(chatId, format = 'json') {
        const response = await fetch(`${this.baseURL}/chat/${chatId}/export?format=${format}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (format === 'txt') {
            return await response.text();
        } else {
            return await response.json();
        }
    }

    // Chat Storage Management Methods
    async getChatStorageInfo() {
        return this.request('/chat/storage/info');
    }

    async createChatBackup() {
        return this.request('/chat/storage/backup', { method: 'POST' });
    }

    async cleanupChatStorage() {
        return this.request('/chat/storage/cleanup', { method: 'POST' });
    }

    // Model provider management
    async getProviders() {
        return this.request('/models/providers');
    }

    async getProviderHealth(providerId) {
        return this.request(`/models/providers/${providerId}/health`);
    }

    async getAllProvidersHealth() {
        return this.request('/models/providers/health');
    }

    async setActiveProvider(providerId) {
        return this.request(`/models/providers/${providerId}/activate`, {
            method: 'POST'
        });
    }

    async updateProviderConfig(providerId, config) {
        return this.request(`/models/providers/${providerId}/config`, {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    async getProviderModels(providerId) {
        return this.request(`/models/providers/${providerId}/models`);
    }

    async getActiveProviderModels() {
        return this.request('/models/active-provider');
    }

    async testProviderModel(providerId, modelName, prompt) {
        return this.request(`/models/providers/${providerId}/test`, {
            method: 'POST',
            body: JSON.stringify({
                modelName,
                prompt
            })
        });
    }

    // Favorites endpoints
    async getProviderFavorites(providerId) {
        return this.request(`/models/favorites/${providerId}`);
    }

    async toggleModelFavorite(providerId, modelName) {
        return this.request(`/models/favorites/${providerId}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ modelName })
        });
    }

    async getAllFavorites() {
        return this.request('/models/favorites');
    }

    async clearProviderFavorites(providerId) {
        return this.request(`/models/favorites/${providerId}`, {
            method: 'DELETE'
        });
    }
} 