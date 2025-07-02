import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SettingsService {
    constructor() {
        this.settingsFile = path.join(__dirname, '../data/settings.json');
        this.defaultSettings = {
            modelParameters: {
                temperature: 0.7,
                topP: 0.9,
                numThread: 4
            }
        };
        this.cachedSettings = null;
    }

    // Ensure data directory exists
    async ensureDataDirectory() {
        const dataDir = path.dirname(this.settingsFile);
        try {
            await fs.access(dataDir);
        } catch (error) {
            await fs.mkdir(dataDir, { recursive: true });
        }
    }

    // Load settings from file
    async loadSettings() {
        try {
            await this.ensureDataDirectory();
            const data = await fs.readFile(this.settingsFile, 'utf8');
            this.cachedSettings = { ...this.defaultSettings, ...JSON.parse(data) };
            return this.cachedSettings;
        } catch (error) {
            // If file doesn't exist or is invalid, return defaults
            this.cachedSettings = this.defaultSettings;
            return this.defaultSettings;
        }
    }

    // Save settings to file
    async saveSettings(settings) {
        try {
            await this.ensureDataDirectory();
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
            this.cachedSettings = settings;
            return true;
        } catch (error) {
            console.error('[SETTINGS] Failed to save settings:', error);
            return false;
        }
    }

    // Get current settings (with caching)
    async getSettings() {
        if (!this.cachedSettings) {
            await this.loadSettings();
        }
        return this.cachedSettings;
    }

    // Get model parameters specifically
    async getModelParameters() {
        const settings = await this.getSettings();
        return settings.modelParameters;
    }

    // Update model parameters
    async updateModelParameters(parameters) {
        const settings = await this.getSettings();
        settings.modelParameters = {
            ...settings.modelParameters,
            ...parameters
        };
        
        const saved = await this.saveSettings(settings);
        return saved ? settings.modelParameters : null;
    }

    // Get Ollama options based on current settings
    async getOllamaOptions() {
        const parameters = await this.getModelParameters();
        
        return {
            num_thread: parameters.numThread,
            temperature: parameters.temperature,
            top_p: parameters.topP
        };
    }

    // Reset settings to defaults
    async resetSettings() {
        return await this.saveSettings(this.defaultSettings);
    }
}

// Export singleton instance
export default new SettingsService(); 