import ollamaService from './ollamaService.js';
import axios from 'axios';
import configManager from './configManager.js';

/**
 * Model Provider Service
 * Manages multiple AI model providers (Ollama, OpenRouter, etc.)
 */
class ModelProviderService {
  constructor() {
    this.providers = new Map();
    this.activeProvider = configManager.getActiveProvider();
    this.initializeProviders();
  }

  initializeProviders() {
    // Get persistent configurations
    const ollamaConfig = configManager.getProviderConfig('ollama');
    const openrouterConfig = configManager.getProviderConfig('openrouter');

    // Initialize Ollama provider
    this.providers.set('ollama', {
      name: 'Ollama',
      type: 'local',
      status: 'unknown',
      models: [],
      config: {
        baseUrl: ollamaConfig.baseUrl || process.env.OLLAMA_HOST || 'http://127.0.0.1:12434',
        ...ollamaConfig
      },
      service: ollamaService
    });

    // Initialize OpenRouter provider
    this.providers.set('openrouter', {
      name: 'OpenRouter',
      type: 'cloud',
      status: 'unknown',
      models: [],
      config: {
        baseUrl: openrouterConfig.baseUrl || 'https://openrouter.ai/api/v1',
        apiKey: openrouterConfig.apiKey || process.env.OPENROUTER_API_KEY || '',
        appName: openrouterConfig.appName || process.env.OPENROUTER_APP_NAME || 'X-AI Discussion System',
        siteUrl: openrouterConfig.siteUrl || process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        ...openrouterConfig
      },
      service: this.createOpenRouterService()
    });

    console.log('[MODEL_PROVIDER] Initialized providers with persistent configuration');
  }

  createOpenRouterService() {
    const self = this;
    return {
      async checkHealth() {
        try {
          const provider = self.providers.get('openrouter');
          if (!provider.config.apiKey) {
            return {
              connected: false,
              message: 'OpenRouter API key not configured',
              requiresSetup: true
            };
          }

          const response = await axios.get(`${provider.config.baseUrl}/models`, {
            headers: {
              'Authorization': `Bearer ${provider.config.apiKey}`,
              'HTTP-Referer': provider.config.siteUrl,
              'X-Title': provider.config.appName
            },
            timeout: 10000
          });

          return {
            connected: true,
            message: 'OpenRouter API is accessible',
            modelsCount: response.data.data?.length || 0
          };
        } catch (error) {
          return {
            connected: false,
            message: error.response?.data?.error?.message || error.message,
            error: error.message
          };
        }
      },

      async getModels() {
        try {
          const provider = self.providers.get('openrouter');
          if (!provider.config.apiKey) {
            throw new Error('OpenRouter API key not configured');
          }

          const response = await axios.get(`${provider.config.baseUrl}/models`, {
            headers: {
              'Authorization': `Bearer ${provider.config.apiKey}`,
              'HTTP-Referer': provider.config.siteUrl,
              'X-Title': provider.config.appName
            },
            timeout: 15000
          });

          // Transform OpenRouter models to match our format
          const models = response.data.data.map(model => ({
            name: model.id,
            displayName: model.name || model.id,
            size: self.formatModelSize(model.context_length),
            modified_at: new Date().toISOString(),
            digest: model.id,
            details: {
              family: self.extractModelFamily(model.id),
              format: 'openrouter',
              parameter_size: model.context_length ? `${model.context_length} tokens` : 'Unknown',
              quantization_level: 'Cloud API'
            },
            provider: 'openrouter',
            pricing: model.pricing,
            context_length: model.context_length,
            description: model.description,
            architecture: model.architecture
          }));

          return models;
        } catch (error) {
          console.error('[OPENROUTER] Error fetching models:', error.message);
          throw error;
        }
      },

      async generateResponse(modelName, messages, options = {}) {
        try {
          const provider = self.providers.get('openrouter');
          if (!provider.config.apiKey) {
            throw new Error('OpenRouter API key not configured');
          }

          const requestBody = {
            model: modelName,
            messages: messages,
            stream: options.stream || false,
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9
          };

          const response = await axios.post(`${provider.config.baseUrl}/chat/completions`, requestBody, {
            headers: {
              'Authorization': `Bearer ${provider.config.apiKey}`,
              'HTTP-Referer': provider.config.siteUrl,
              'X-Title': provider.config.appName,
              'Content-Type': 'application/json'
            },
            timeout: options.timeout || 60000,
            responseType: options.stream ? 'stream' : 'json'
          });

          if (options.stream) {
            return response.data; // Return stream for streaming responses
          } else {
            return {
              message: {
                content: response.data.choices[0].message.content
              },
              usage: response.data.usage
            };
          }
        } catch (error) {
          console.error('[OPENROUTER] Error generating response:', error.message);
          throw error;
        }
      },

      async testModel(modelName, prompt = 'Hello, how are you?') {
        try {
          const startTime = Date.now();
          const messages = [{ role: 'user', content: prompt }];
          
          const result = await this.generateResponse(modelName, messages, {
            max_tokens: 100,
            temperature: 0.7
          });

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          return {
            success: true,
            prompt: prompt,
            response: result.message.content,
            responseTime: responseTime,
            usage: result.usage
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      },

      async generateResponseStream(modelName, messages, onChunk, options = {}) {
        const config = configManager.getProviderConfig('openrouter');
        if (!config.apiKey) {
          throw new Error('OpenRouter API key not configured');
        }

        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': config.httpReferer || 'http://localhost:3000',
              'X-Title': config.xTitle || 'X-AI Chat'
            },
            body: JSON.stringify({
              model: modelName,
              messages: messages,
              stream: true,
              max_tokens: options.maxTokens || 2000,
              temperature: options.temperature || 0.7
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    onChunk({ content: '', done: true });
                    return;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;
                    
                    if (delta?.content) {
                      onChunk({
                        content: delta.content,
                        done: false
                      });
                    }
                    
                    if (parsed.choices?.[0]?.finish_reason) {
                      onChunk({
                        content: '',
                        done: true,
                        usage: parsed.usage
                      });
                      return;
                    }
                  } catch (parseError) {
                    console.warn('[OPENROUTER] Failed to parse streaming chunk:', parseError);
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          console.error('[OPENROUTER] Streaming error:', error);
          throw error;
        }
      }
    };
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

  extractModelFamily(modelId) {
    const families = {
      'gpt': 'GPT',
      'claude': 'Claude',
      'llama': 'Llama',
      'mistral': 'Mistral',
      'gemma': 'Gemma',
      'qwen': 'Qwen',
      'deepseek': 'DeepSeek',
      'yi': 'Yi'
    };

    const lowerModelId = modelId.toLowerCase();
    for (const [key, family] of Object.entries(families)) {
      if (lowerModelId.includes(key)) {
        return family;
      }
    }
    return 'Unknown';
  }

  /**
   * Get all available providers
   */
  getProviders() {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      name: provider.name,
      type: provider.type,
      status: provider.status,
      modelsCount: provider.models.length,
      config: configManager.getMaskedProviderConfig(id)
    }));
  }

  /**
   * Get active provider
   */
  getActiveProvider() {
    return this.activeProvider;
  }

  /**
   * Set active provider
   */
  setActiveProvider(providerId) {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.activeProvider = providerId;
    configManager.setActiveProvider(providerId);
    console.log(`[MODEL_PROVIDER] Active provider set to: ${providerId}`);
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    try {
      const health = await provider.service.checkHealth();
      provider.status = health.connected ? 'connected' : 'disconnected';
      return {
        providerId,
        ...health
      };
    } catch (error) {
      provider.status = 'error';
      return {
        providerId,
        connected: false,
        message: error.message,
        error: error.message
      };
    }
  }

  /**
   * Check health of all providers
   */
  async checkAllProvidersHealth() {
    const results = {};
    
    for (const [providerId] of this.providers) {
      try {
        results[providerId] = await this.checkProviderHealth(providerId);
      } catch (error) {
        results[providerId] = {
          providerId,
          connected: false,
          error: error.message
        };
      }
    }
    
    return results;
  }

  /**
   * Get models from a specific provider
   */
  async getProviderModels(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    try {
      const models = await provider.service.getModels();
      provider.models = models;
      return models.map(model => ({
        ...model,
        providerId,
        providerName: provider.name,
        providerType: provider.type
      }));
    } catch (error) {
      console.error(`[MODEL_PROVIDER] Error getting models from ${providerId}:`, error.message);
      return [];
    }
  }

  /**
   * Get models from all providers
   */
  async getAllModels() {
    const allModels = [];
    
    for (const [providerId] of this.providers) {
      try {
        const models = await this.getProviderModels(providerId);
        allModels.push(...models);
      } catch (error) {
        console.error(`[MODEL_PROVIDER] Failed to get models from ${providerId}:`, error.message);
      }
    }
    
    return allModels;
  }

  /**
   * Get models from active provider
   */
  async getActiveProviderModels() {
    return this.getProviderModels(this.activeProvider);
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerId, config) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Update in-memory config
    provider.config = { ...provider.config, ...config };
    
    // Save to persistent storage
    configManager.updateProviderConfig(providerId, config);
    
    // Reinitialize service if needed
    if (providerId === 'openrouter') {
      provider.service = this.createOpenRouterService();
    }

    console.log(`[MODEL_PROVIDER] Updated config for ${providerId} (saved to file)`);
    return configManager.getMaskedProviderConfig(providerId);
  }

  /**
   * Test a model from any provider
   */
  async testModel(providerId, modelName, prompt = 'Hello, how are you?') {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    return provider.service.testModel(modelName, prompt);
  }

  /**
   * Generate response using a model from any provider
   */
  async generateResponse(providerId, modelName, messages, options = {}) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    if (providerId === 'ollama') {
      // Use existing Ollama service methods
      return provider.service.generateResponse(modelName, messages, options);
    } else if (providerId === 'openrouter') {
      return provider.service.generateResponse(modelName, messages, options);
    }

    throw new Error(`Response generation not implemented for provider ${providerId}`);
  }

  /**
   * Generate streaming response from a specific provider
   */
  async generateResponseStream(providerId, modelName, messages, onChunk, options = {}) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    try {
      if (providerId === 'openrouter' && provider.service.generateResponseStream) {
        return await provider.service.generateResponseStream(modelName, messages, onChunk, options);
      } else {
        // Fallback to non-streaming for providers that don't support streaming
        const response = await provider.service.generateResponse(modelName, messages, options);
        
        // Simulate streaming by sending the full response
        onChunk({
          content: response.message.content,
          done: false
        });
        
        onChunk({
          content: '',
          done: true,
          usage: response.usage
        });
      }
    } catch (error) {
      console.error(`[MODEL_PROVIDER] Error generating streaming response from ${providerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats() {
    const stats = {};
    
    for (const [providerId, provider] of this.providers) {
      stats[providerId] = {
        name: provider.name,
        type: provider.type,
        status: provider.status,
        modelsCount: provider.models.length,
        isActive: providerId === this.activeProvider
      };
    }
    
    return stats;
  }
}

// Create singleton instance
const modelProviderService = new ModelProviderService();

export default modelProviderService; 