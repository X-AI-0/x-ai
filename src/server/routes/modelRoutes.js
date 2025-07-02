import express from 'express';
import ollamaService from '../services/ollamaService.js';
import modelProviderService from '../services/modelProviderService.js';
import ollamaInstaller from '../services/ollamaInstaller.js';
import favoritesManager from '../services/favoritesManager.js';
import { broadcastToClients } from '../services/websocketService.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

/**
 * GET /api/models/providers
 * Get all available model providers
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = modelProviderService.getProviders();
    const activeProvider = modelProviderService.getActiveProvider();
    
    res.json({
      success: true,
      data: {
        providers,
        activeProvider,
        stats: modelProviderService.getProviderStats()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/providers/:providerId/activate
 * Set active provider
 */
router.post('/providers/:providerId/activate', async (req, res) => {
  try {
    const { providerId } = req.params;
    modelProviderService.setActiveProvider(providerId);
    
    res.json({
      success: true,
      message: `Active provider set to ${providerId}`,
      activeProvider: providerId
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/providers/:providerId/health
 * Check health of a specific provider
 */
router.get('/providers/:providerId/health', async (req, res) => {
  try {
    const { providerId } = req.params;
    const health = await modelProviderService.checkProviderHealth(providerId);
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/providers/health
 * Check health of all providers
 */
router.get('/providers/health', async (req, res) => {
  try {
    const healthResults = await modelProviderService.checkAllProvidersHealth();
    
    res.json({
      success: true,
      data: healthResults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/models/providers/:providerId/config
 * Update provider configuration
 */
router.put('/providers/:providerId/config', async (req, res) => {
  try {
    const { providerId } = req.params;
    const config = req.body;
    
    const updatedConfig = modelProviderService.updateProviderConfig(providerId, config);
    
    res.json({
      success: true,
      message: `Configuration updated for ${providerId}`,
      data: updatedConfig
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/providers/:providerId/models
 * Get models from a specific provider
 */
router.get('/providers/:providerId/models', async (req, res) => {
  try {
    const { providerId } = req.params;
    const models = await modelProviderService.getProviderModels(providerId);
    
    // Sort models with favorites first
    const sortedModels = favoritesManager.sortModelsWithFavorites(providerId, models);
    
    res.json({
      success: true,
      data: sortedModels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

/**
 * GET /api/models/active-provider
 * Get models from the active provider
 */
router.get('/active-provider', async (req, res) => {
  try {
    const models = await modelProviderService.getActiveProviderModels();
    const activeProvider = modelProviderService.getActiveProvider();
    
    // Sort models with favorites first
    const sortedModels = favoritesManager.sortModelsWithFavorites(activeProvider, models);
    
    res.json({
      success: true,
      data: sortedModels,
      provider: activeProvider
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

/**
 * POST /api/models/providers/:providerId/test
 * Test a model from a specific provider
 */
router.post('/providers/:providerId/test', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { modelName, prompt = 'Hello, how are you?' } = req.body;
    
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    const testResult = await modelProviderService.testModel(providerId, modelName, prompt);

    res.json({
      success: testResult.success,
      data: testResult.success ? {
        providerId,
        modelName,
        prompt: testResult.prompt,
        response: testResult.response,
        responseTime: testResult.responseTime,
        usage: testResult.usage,
        timestamp: new Date().toISOString()
      } : null,
      error: testResult.success ? null : testResult.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/favorites/:providerId
 * Get favorites for a specific provider
 */
router.get('/favorites/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const favorites = favoritesManager.getProviderFavorites(providerId);
    
    res.json({
      success: true,
      data: {
        providerId,
        favorites,
        count: favorites.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/favorites/:providerId/toggle
 * Toggle favorite status for a model
 */
router.post('/favorites/:providerId/toggle', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { modelName } = req.body;
    
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    const result = favoritesManager.toggleFavorite(providerId, modelName);
    
    res.json({
      success: result.success,
      data: {
        providerId,
        modelName,
        action: result.action,
        isFavorite: result.action === 'added',
        favoritesCount: favoritesManager.getFavoritesCount(providerId)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/favorites
 * Get all favorites for all providers
 */
router.get('/favorites', async (req, res) => {
  try {
    const allFavorites = favoritesManager.getAllFavorites();
    
    res.json({
      success: true,
      data: allFavorites
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/models/favorites/:providerId
 * Clear all favorites for a specific provider
 */
router.delete('/favorites/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const success = favoritesManager.clearProviderFavorites(providerId);
    
    res.json({
      success,
      message: success ? `Cleared all favorites for ${providerId}` : `No favorites found for ${providerId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/health
 * Check Ollama service health with GPU status (backward compatibility)
 */
router.get('/health', async (req, res) => {
  try {
    const health = await ollamaService.checkHealth();
    
    // Add GPU information to health check
    const gpuInfo = {
      gpuEnabled: process.env.OLLAMA_FORCE_GPU === '1',
      cudaDevice: process.env.CUDA_VISIBLE_DEVICES,
      numGPU: process.env.OLLAMA_NUM_GPU,
      gpuMemoryFraction: process.env.OLLAMA_GPU_MEMORY_FRACTION,
      llmLibrary: process.env.OLLAMA_LLM_LIBRARY
    };
    
    res.json({
      success: true,
      data: {
        ...health,
        gpu: gpuInfo,
        message: health.connected ? 
          'Ollama service running with NVIDIA GPU acceleration' : 
          'Ollama service not available'
      }
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: 'Ollama service is not available'
    });
  }
});

/**
 * GET /api/models
 * Get list of all available models from all providers
 */
router.get('/', async (req, res) => {
  try {
    const { provider } = req.query;
    
    let models;
    if (provider) {
      // Get models from specific provider
      models = await modelProviderService.getProviderModels(provider);
    } else {
      // Get models from all providers
      models = await modelProviderService.getAllModels();
    }
    
    res.json({
      success: true,
      data: models,
      activeProvider: modelProviderService.getActiveProvider()
    });
  } catch (error) {
    // Return empty array instead of error when providers are not available
    res.json({
      success: true,
      data: [],
      warning: 'Some model providers may not be available',
      activeProvider: modelProviderService.getActiveProvider()
    });
  }
});

/**
 * GET /api/models/running
 * Get list of currently running models (Ollama only)
 */
router.get('/running', async (req, res) => {
  try {
    const runningModels = await ollamaService.getRunningModels();
    res.json({
      success: true,
      data: runningModels
    });
  } catch (error) {
    res.json({
      success: true,
      data: [],
      warning: 'Ollama service is not available'
    });
  }
});

/**
 * GET /api/models/:name
 * Get detailed information about a specific model
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { provider } = req.query;
    
    if (provider && provider !== 'ollama') {
      // For non-Ollama providers, return basic info
      const models = await modelProviderService.getProviderModels(provider);
      const model = models.find(m => m.name === name);
      
      if (!model) {
        return res.status(404).json({
          success: false,
          error: 'Model not found'
        });
      }
      
      res.json({
        success: true,
        data: model
      });
    } else {
      // Use Ollama service for detailed model info
      const modelInfo = await ollamaService.getModelInfo(name);
      res.json({
        success: true,
        data: modelInfo
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/pull
 * Pull a new model from Ollama registry (Ollama only)
 */
router.post('/pull', async (req, res) => {
  try {
    const { modelName } = req.body;
    
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    // Check if Ollama is available first
    const health = await ollamaService.checkHealth();
    if (!health.connected) {
      return res.status(503).json({
        success: false,
        error: 'Ollama service is not available. Please make sure Ollama is running.'
      });
    }

    // Generate a unique download ID
    const downloadId = Date.now().toString();

    // Start the pull process
    res.json({
      success: true,
      message: `Started pulling model: ${modelName}`,
      modelName: modelName,
      downloadId: downloadId
    });

    console.log(`[MODEL_PULL] Starting pull for model: ${modelName}, downloadId: ${downloadId}`);

    // Start the pull process in the background
    ollamaService.pullModel(modelName, (progress) => {
      // Broadcast progress to all connected clients
      broadcastToClients({
        type: 'model_pull_progress',
        modelName: modelName,
        downloadId: downloadId,
        progress: progress
      });
    }).then(() => {
      // Broadcast completion
      broadcastToClients({
        type: 'model_pull_complete',
        modelName: modelName,
        downloadId: downloadId,
        message: `Model ${modelName} pulled successfully`
      });
    }).catch((error) => {
      // Broadcast error
      broadcastToClients({
        type: 'model_pull_error',
        modelName: modelName,
        downloadId: downloadId,
        error: error.message
      });
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/models/:name
 * Delete a model (Ollama only)
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Check if Ollama is available first
    const health = await ollamaService.checkHealth();
    if (!health.connected) {
      return res.status(503).json({
        success: false,
        error: 'Ollama service is not available. Please make sure Ollama is running.'
      });
    }

    const result = await ollamaService.deleteModel(name);
    
    // Broadcast model deletion
    broadcastToClients({
      type: 'model_deleted',
      modelName: name,
      message: result.message
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/test
 * Test a model with a simple prompt (backward compatibility)
 */
router.post('/test', async (req, res) => {
  try {
    const { modelName, prompt = 'hi', provider } = req.body;
    
    if (!modelName) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required'
      });
    }

    const targetProvider = provider || modelProviderService.getActiveProvider();
    const testResult = await modelProviderService.testModel(targetProvider, modelName, prompt);

    res.json({
      success: testResult.success,
      data: testResult.success ? {
        provider: targetProvider,
        modelName: modelName,
        prompt: testResult.prompt,
        response: testResult.response,
        responseTime: testResult.responseTime,
        usage: testResult.usage,
        timestamp: new Date().toISOString()
      } : null,
      error: testResult.success ? null : testResult.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/ollama/version
 * Get Ollama version information
 */
router.get('/ollama/version', async (req, res) => {
  try {
    const versionInfo = await ollamaInstaller.getOllamaVersion();
    res.json(versionInfo);
  } catch (error) {
    console.error('Error getting Ollama version:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/ollama/check-installation
 * Check if Ollama is installed
 */
router.get('/ollama/check-installation', async (req, res) => {
  try {
    const installationStatus = await ollamaInstaller.checkOllamaInstalled();
    const installationInfo = ollamaInstaller.getInstallationInfo();
    
    res.json({
      success: true,
      data: {
        ...installationStatus,
        installationInfo
      }
    });
  } catch (error) {
    console.error('Error checking Ollama installation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/ollama/install
 * Install Ollama automatically with optional GitHub token
 */
router.post('/ollama/install', async (req, res) => {
  try {
    console.log('[INSTALL] Starting Ollama installation process...');
    
    // Extract GitHub token from request body if provided
    const { githubToken } = req.body;
    if (githubToken) {
      console.log('[INSTALL] Using user-provided GitHub token for installation');
    }
    
    // Check if already installed
    const installationStatus = await ollamaInstaller.checkOllamaInstalled();
    if (installationStatus.installed) {
      console.log('[INSTALL] Ollama is already installed');
      return res.json({
        success: true,
        message: 'Ollama is already installed',
        data: installationStatus
      });
    }

    console.log('[INSTALL] Ollama not found, starting installation...');
    
    // Start installation
    res.json({
      success: true,
      message: 'Installation started',
      installing: true
    });

    // Install in background with WebSocket progress updates
    console.log('[INSTALL] Starting background installation with progress tracking...');
    
    // Add progress throttling to reduce log spam
    let lastLogTime = 0;
    const LOG_INTERVAL = 10000; // Log every 10 seconds
    
    ollamaInstaller.installOllama((progress) => {
      const now = Date.now();
      
      // Only log progress every 5 seconds or on important stage changes
      if (now - lastLogTime > LOG_INTERVAL || 
          progress.stage !== 'downloading' || 
          progress.progress === 0 || 
          progress.progress >= 100) {
        console.log('[INSTALL] Progress update:', {
          stage: progress.stage,
          message: progress.message,
          progress: progress.progress?.toFixed(1) + '%'
        });
        lastLogTime = now;
      }
      
      broadcastToClients({
        type: 'ollama_installation_progress',
        progress
      });
    }, githubToken).then((result) => {
      console.log('[INSTALL] Installation completed successfully:', result);
      broadcastToClients({
        type: 'ollama_installation_completed',
        success: true,
        result
      });
    }).catch((error) => {
      console.error('[INSTALL] Installation failed:', error);
      broadcastToClients({
        type: 'ollama_installation_error',
        success: false,
        error: error.message
      });
    });

  } catch (error) {
    console.error('[INSTALL] Error in install route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/ollama/start
 * Start Ollama service with NVIDIA GPU acceleration
 */
router.post('/ollama/start', async (req, res) => {
  try {
    console.log('[START] 🚀 Starting Ollama service with NVIDIA GPU acceleration...');
    
    // First check if it is installed 
    const installationStatus = await ollamaInstaller.checkOllamaInstalled();
    
    if (!installationStatus.installed) {
      return res.status(400).json({
        success: false,
        error: 'Ollama is not installed. Please install it first.',
        needsInstallation: true
      });
    }

    // Stop existing processes first
    console.log('[START] 🛑 Stopping existing Ollama processes...');
    await stopOllamaProcesses();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Use the enhanced GPU-enabled auto-start method
    console.log('[START] ⚡ Starting Ollama with NVIDIA GPU configuration...');
    const startResult = await ollamaService.autoStartOllama();
    
    if (!startResult.success) {
      console.log('[START] ❌ GPU start failed, trying fallback method...');
      
      // Fallback to standard start if GPU start fails
    if (installationStatus.location === 'local') {
        // Use local installed ollama
        await ollamaInstaller.startLocalOllama();
    } else {
        // Use system installed ollama
      const startCommand = process.platform === 'win32' 
        ? 'start /B ollama serve' 
        : 'ollama serve &';
      
      await execAsync(startCommand);
      }
      
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    
    // Verify service started successfully
    const health = await ollamaService.checkHealth();
    
    console.log(`[START] 📊 Service status: ${health.connected ? 'Connected' : 'Failed'}`);
    
    // Broadcast to clients
    broadcastToClients({
      type: 'ollama_service_started',
      success: health.connected,
      message: health.connected 
        ? '🚀 Ollama service started with NVIDIA GPU acceleration' 
        : 'Failed to start Ollama service',
      gpu: startResult.gpu || 'Unknown',
      installationInfo: ollamaInstaller.getInstallationInfo()
    });
    
    const responseMessage = health.connected 
      ? (startResult.success 
          ? '🎯 Ollama service started with NVIDIA GPU acceleration!' 
          : '✅ Ollama service started successfully')
      : 'Failed to start Ollama service';
    
    res.json({
      success: health.connected,
      message: responseMessage,
      gpu: startResult.gpu,
      data: {
        health,
        startResult,
        installationStatus,
        gpuAcceleration: startResult.success
      }
    });
    
  } catch (error) {
    console.error('[START] ❌ Error starting Ollama:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start Ollama service: ' + error.message
    });
  }
});

/**
 * POST /api/models/ollama/stop
 * Stop Ollama service
 */
router.post('/ollama/stop', async (req, res) => {
  try {
    await stopOllamaProcesses();
    
    // Wait for processes to stop
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify service is stopped
    const health = await ollamaService.checkHealth();
    
    broadcastToClients({
      type: 'ollama_service_stopped',
      success: !health.connected,
      message: !health.connected ? 'Ollama service stopped successfully' : 'Failed to stop Ollama service'
    });
    
    res.json({
      success: !health.connected,
      message: !health.connected ? 'Ollama service stopped successfully' : 'Failed to stop Ollama service'
    });
  } catch (error) {
    console.error('Error stopping Ollama:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop Ollama service: ' + error.message
    });
  }
});

/**
 * POST /api/models/ollama/restart
 * Restart Ollama service with NVIDIA GPU acceleration
 */
router.post('/ollama/restart', async (req, res) => {
  try {
    console.log('[RESTART] 🔄 Restarting Ollama service with NVIDIA GPU acceleration...');
    
    // Stop existing processes first
    console.log('[RESTART] 🛑 Stopping existing Ollama processes...');
    await stopOllamaProcesses();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Use the enhanced GPU-enabled auto-start method (same as start)
    console.log('[RESTART] ⚡ Starting Ollama with NVIDIA GPU configuration...');
    const startResult = await ollamaService.autoStartOllama();
    
    if (!startResult.success) {
      console.log('[RESTART] ❌ GPU restart failed, trying fallback method...');
      
      // Fallback to standard restart if GPU restart fails
      const installationStatus = await ollamaInstaller.checkOllamaInstalled();
      
      if (installationStatus.location === 'local') {
        // Use local installed ollama
        await ollamaInstaller.startLocalOllama();
      } else {
        // Use system installed ollama
        const startCommand = process.platform === 'win32' 
          ? 'start /B ollama serve' 
          : 'ollama serve &';
        
        await execAsync(startCommand);
      }
      
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    
    // Verify service restarted successfully
    const health = await ollamaService.checkHealth();
    
    console.log(`[RESTART] 📊 Service status: ${health.connected ? 'Connected' : 'Failed'}`);
    
    // Broadcast to clients
    broadcastToClients({
      type: 'ollama_service_restarted',
      success: health.connected,
      message: health.connected 
        ? '🚀 Ollama service restarted with NVIDIA GPU acceleration' 
        : 'Failed to restart Ollama service',
      gpu: startResult.gpu || 'Unknown'
    });
    
    const responseMessage = health.connected 
      ? (startResult.success 
          ? '🎯 Ollama service restarted with NVIDIA GPU acceleration!' 
          : '✅ Ollama service restarted successfully')
      : 'Failed to restart Ollama service';
    
    res.json({
      success: health.connected,
      message: responseMessage,
      gpu: startResult.gpu,
      data: {
        health,
        startResult,
        gpuAcceleration: startResult.success
      }
    });
  } catch (error) {
    console.error('[RESTART] ❌ Error restarting Ollama:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart Ollama service: ' + error.message
    });
  }
});

/**
 * POST /api/models/ollama/update
 * Update Ollama to latest version with CUDA support
 */
router.post('/ollama/update', async (req, res) => {
  try {
    console.log('[UPDATE] 🔄 Starting Ollama update...');
    
    // Stop current Ollama service
    await stopOllamaProcesses();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get current installation status
    const currentStatus = await ollamaInstaller.checkOllamaInstalled();
    
    if (!currentStatus.installed) {
      return res.status(400).json({
        success: false,
        error: 'Ollama is not currently installed'
      });
    }
    
    console.log('[UPDATE] 📥 Downloading latest Ollama version with CUDA support...');
    
    // Update the installation
    const updateResult = await ollamaInstaller.updateOllama();
    
    if (updateResult.success) {
      console.log('[UPDATE] ✅ Update completed successfully');
      
      // Broadcast update completion
      broadcastToClients({
        type: 'ollama_update_completed',
        success: true,
        message: 'Ollama updated successfully with improved GPU support',
        version: updateResult.version || 'latest'
      });
      
      res.json({
        success: true,
        message: 'Ollama updated successfully! Please restart the service.',
        data: updateResult
      });
    } else {
      console.log('[UPDATE] ❌ Update failed:', updateResult.error);
      
      broadcastToClients({
        type: 'ollama_update_error',
        success: false,
        error: updateResult.error
      });
      
      res.status(500).json({
        success: false,
        error: updateResult.error || 'Failed to update Ollama'
      });
    }
    
  } catch (error) {
    console.error('[UPDATE] Error updating Ollama:', error);
    
    broadcastToClients({
      type: 'ollama_update_error',
      success: false,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update Ollama: ' + error.message
    });
  }
});

/**
 * POST /api/models/ollama/uninstall
 * Uninstall Ollama completely
 */
router.post('/ollama/uninstall', async (req, res) => {
  try {
    console.log('[UNINSTALL] 🗑️ Starting Ollama uninstallation...');
    
    // Stop current Ollama service
    await stopOllamaProcesses();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get current installation status
    const currentStatus = await ollamaInstaller.checkOllamaInstalled();
    
    if (!currentStatus.installed) {
      return res.json({
        success: true,
        message: 'Ollama is not currently installed'
      });
    }
    
    console.log('[UNINSTALL] 🧹 Removing Ollama installation and data...');
    
    // Uninstall Ollama
    const uninstallResult = await ollamaInstaller.uninstallOllama();
    
    if (uninstallResult.success) {
      console.log('[UNINSTALL] ✅ Uninstallation completed successfully');
      
      // Broadcast uninstall completion
      broadcastToClients({
        type: 'ollama_uninstall_completed',
        success: true,
        message: 'Ollama uninstalled successfully'
      });
      
      res.json({
        success: true,
        message: 'Ollama uninstalled successfully!',
        data: uninstallResult
      });
    } else {
      console.log('[UNINSTALL] ❌ Uninstall failed:', uninstallResult.error);
      
      broadcastToClients({
        type: 'ollama_uninstall_error',
        success: false,
        error: uninstallResult.error
      });
      
      res.status(500).json({
        success: false,
        error: uninstallResult.error || 'Failed to uninstall Ollama'
      });
    }
    
  } catch (error) {
    console.error('[UNINSTALL] Error uninstalling Ollama:', error);
    
    broadcastToClients({
      type: 'ollama_uninstall_error',
      success: false,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to uninstall Ollama: ' + error.message
    });
  }
});

/**
 * POST /api/models/ollama/download/pause
 * Pause current download
 */
router.post('/ollama/download/pause', async (req, res) => {
  try {
    const result = ollamaInstaller.pauseDownload();
    res.json(result);
  } catch (error) {
    console.error('Error pausing download:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/ollama/download/resume
 * Resume paused download
 */
router.post('/ollama/download/resume', async (req, res) => {
  try {
    const result = ollamaInstaller.resumeDownload();
    res.json(result);
  } catch (error) {
    console.error('Error resuming download:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/models/ollama/download/cancel
 * Cancel current download
 */
router.post('/ollama/download/cancel', async (req, res) => {
  try {
    const result = ollamaInstaller.cancelDownload();
    res.json(result);
  } catch (error) {
    console.error('Error cancelling download:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/ollama/download/status
 * Get current download status
 */
router.get('/ollama/download/status', async (req, res) => {
  try {
    const status = ollamaInstaller.getDownloadStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting download status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to stop Ollama processes
 */
async function stopOllamaProcesses() {
  try {
    if (process.platform === 'win32') {
      // Windows
      try {
        await execAsync('taskkill /F /IM "ollama app.exe"');
      } catch (e) {
        // Ignore if no process found
      }
      try {
        await execAsync('taskkill /F /IM "ollama.exe"');
      } catch (e) {
        // Ignore if no process found
      }
    } else {
      // Unix-like systems
      try {
        await execAsync('pkill -f "ollama serve"');
      } catch (e) {
        // Ignore if no process found
      }
    }
  } catch (error) {
    console.error('Error stopping Ollama processes:', error);
  }
}

export default router; 