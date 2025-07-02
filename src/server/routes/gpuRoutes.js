import express from 'express';
import gpuConfigService from '../services/gpuConfigService.js';

const router = express.Router();

/**
 * GET /api/gpu/config
 * Get current GPU configuration
 */
router.get('/config', async (req, res) => {
  try {
    const config = gpuConfigService.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting GPU config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/gpu/config
 * Update GPU configuration
 */
router.post('/config', async (req, res) => {
  try {
    const { enableGPU, selectedGPU, numGPU, numThread } = req.body;
    
    const updateData = {};
    if (typeof enableGPU === 'boolean') updateData.enableGPU = enableGPU;
    if (typeof selectedGPU === 'number') updateData.selectedGPU = selectedGPU;
    if (typeof numGPU === 'number') updateData.numGPU = numGPU;
    if (typeof numThread === 'number') updateData.numThread = numThread;
    
    const updatedConfig = gpuConfigService.updateConfig(updateData);
    
    res.json({
      success: true,
      data: updatedConfig,
      message: 'GPU configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating GPU config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/gpu/detect
 * Detect available GPUs
 */
router.get('/detect', async (req, res) => {
  try {
    const gpus = await gpuConfigService.detectGPUs();
    res.json({
      success: true,
      data: {
        gpus,
        detectedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error detecting GPUs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/gpu/reset
 * Reset GPU configuration to defaults
 */
router.post('/reset', async (req, res) => {
  try {
    const defaultConfig = gpuConfigService.resetToDefaults();
    res.json({
      success: true,
      data: defaultConfig,
      message: 'GPU configuration reset to defaults'
    });
  } catch (error) {
    console.error('Error resetting GPU config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/gpu/options
 * Get current Ollama GPU options based on configuration
 */
router.get('/options', async (req, res) => {
  try {
    const options = gpuConfigService.getOllamaOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Error getting GPU options:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 