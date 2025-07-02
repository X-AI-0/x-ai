import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FavoritesManager {
  constructor() {
    this.configDir = path.join(__dirname, '../../config');
    this.favoritesFile = path.join(this.configDir, 'favorites.json');
    this.ensureConfigDir();
    this.loadFavorites();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadFavorites() {
    try {
      if (fs.existsSync(this.favoritesFile)) {
        const favoritesData = fs.readFileSync(this.favoritesFile, 'utf8');
        this.favorites = JSON.parse(favoritesData);
        console.log('[FAVORITES] Loaded favorites from file');
      } else {
        this.favorites = this.getDefaultFavorites();
        this.saveFavorites();
        console.log('[FAVORITES] Created default favorites configuration');
      }
    } catch (error) {
      console.error('[FAVORITES] Error loading favorites:', error.message);
      this.favorites = this.getDefaultFavorites();
    }
  }

  getDefaultFavorites() {
    return {
      providers: {
        ollama: [],
        openrouter: []
      },
      lastUpdated: new Date().toISOString()
    };
  }

  saveFavorites() {
    try {
      this.favorites.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.favoritesFile, JSON.stringify(this.favorites, null, 2));
      console.log('[FAVORITES] Saved favorites to file');
    } catch (error) {
      console.error('[FAVORITES] Error saving favorites:', error.message);
    }
  }

  /**
   * Get favorites for a specific provider
   */
  getProviderFavorites(providerId) {
    if (!this.favorites.providers[providerId]) {
      this.favorites.providers[providerId] = [];
    }
    return this.favorites.providers[providerId];
  }

  /**
   * Add a model to favorites for a specific provider
   */
  addFavorite(providerId, modelName) {
    if (!this.favorites.providers[providerId]) {
      this.favorites.providers[providerId] = [];
    }

    const favorites = this.favorites.providers[providerId];
    if (!favorites.includes(modelName)) {
      favorites.push(modelName);
      this.saveFavorites();
      console.log(`[FAVORITES] Added ${modelName} to ${providerId} favorites`);
      return true;
    }
    return false; // Already in favorites
  }

  /**
   * Remove a model from favorites for a specific provider
   */
  removeFavorite(providerId, modelName) {
    if (!this.favorites.providers[providerId]) {
      return false;
    }

    const favorites = this.favorites.providers[providerId];
    const index = favorites.indexOf(modelName);
    if (index > -1) {
      favorites.splice(index, 1);
      this.saveFavorites();
      console.log(`[FAVORITES] Removed ${modelName} from ${providerId} favorites`);
      return true;
    }
    return false; // Not in favorites
  }

  /**
   * Check if a model is favorited for a specific provider
   */
  isFavorite(providerId, modelName) {
    if (!this.favorites.providers[providerId]) {
      return false;
    }
    return this.favorites.providers[providerId].includes(modelName);
  }

  /**
   * Toggle favorite status for a model
   */
  toggleFavorite(providerId, modelName) {
    if (this.isFavorite(providerId, modelName)) {
      return {
        action: 'removed',
        success: this.removeFavorite(providerId, modelName)
      };
    } else {
      return {
        action: 'added',
        success: this.addFavorite(providerId, modelName)
      };
    }
  }

  /**
   * Get all favorites for all providers
   */
  getAllFavorites() {
    return this.favorites.providers;
  }

  /**
   * Clear all favorites for a specific provider
   */
  clearProviderFavorites(providerId) {
    if (this.favorites.providers[providerId]) {
      this.favorites.providers[providerId] = [];
      this.saveFavorites();
      console.log(`[FAVORITES] Cleared all favorites for ${providerId}`);
      return true;
    }
    return false;
  }

  /**
   * Get favorites count for a specific provider
   */
  getFavoritesCount(providerId) {
    return this.getProviderFavorites(providerId).length;
  }

  /**
   * Sort models with favorites first
   */
  sortModelsWithFavorites(providerId, models) {
    const favorites = this.getProviderFavorites(providerId);
    
    const favoriteModels = [];
    const regularModels = [];

    models.forEach(model => {
      if (favorites.includes(model.name)) {
        model.isFavorite = true;
        favoriteModels.push(model);
      } else {
        model.isFavorite = false;
        regularModels.push(model);
      }
    });

    // Sort favorites by name, then regular models by name
    favoriteModels.sort((a, b) => a.name.localeCompare(b.name));
    regularModels.sort((a, b) => a.name.localeCompare(b.name));

    return [...favoriteModels, ...regularModels];
  }
}

export default new FavoritesManager(); 