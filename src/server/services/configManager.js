import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConfigManager {
  constructor() {
    this.configDir = path.join(__dirname, '../../config');
    this.configFile = path.join(this.configDir, 'providers.json');
    this.ensureConfigDir();
    this.loadConfig();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const configData = fs.readFileSync(this.configFile, 'utf8');
        this.config = JSON.parse(configData);
        console.log('[CONFIG] Loaded provider configurations from file');
      } else {
        this.config = this.getDefaultConfig();
        this.saveConfig();
        console.log('[CONFIG] Created default provider configuration');
      }
    } catch (error) {
      console.error('[CONFIG] Error loading configuration:', error.message);
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      providers: {
        ollama: {
          baseUrl: 'http://127.0.0.1:12434',
          enabled: true
        },
        openrouter: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY || '',
          appName: process.env.OPENROUTER_APP_NAME || 'X-AI Discussion System',
          siteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
          enabled: true
        }
      },
      activeProvider: 'ollama',
      lastUpdated: new Date().toISOString()
    };
  }

  saveConfig() {
    try {
      this.config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      console.log('[CONFIG] Saved provider configurations to file');
    } catch (error) {
      console.error('[CONFIG] Error saving configuration:', error.message);
    }
  }

  getProviderConfig(providerId) {
    return this.config.providers[providerId] || {};
  }

  updateProviderConfig(providerId, config) {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {};
    }
    
    this.config.providers[providerId] = {
      ...this.config.providers[providerId],
      ...config
    };
    
    this.saveConfig();
    return this.config.providers[providerId];
  }

  getActiveProvider() {
    return this.config.activeProvider || 'ollama';
  }

  setActiveProvider(providerId) {
    this.config.activeProvider = providerId;
    this.saveConfig();
  }

  getAllProviderConfigs() {
    return this.config.providers;
  }

  resetProviderConfig(providerId) {
    const defaultConfig = this.getDefaultConfig();
    if (defaultConfig.providers[providerId]) {
      this.config.providers[providerId] = { ...defaultConfig.providers[providerId] };
      this.saveConfig();
      return this.config.providers[providerId];
    }
    return {};
  }

  // Security: Mask sensitive data when returning config
  getMaskedProviderConfig(providerId) {
    const config = this.getProviderConfig(providerId);
    const maskedConfig = { ...config };
    
    if (maskedConfig.apiKey) {
      maskedConfig.apiKey = '***configured***';
    }
    
    return maskedConfig;
  }

  getAllMaskedProviderConfigs() {
    const configs = {};
    for (const [providerId, config] of Object.entries(this.config.providers)) {
      configs[providerId] = this.getMaskedProviderConfig(providerId);
    }
    return configs;
  }
}

export default new ConfigManager(); 