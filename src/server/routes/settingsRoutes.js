import express from 'express';
import settingsService from '../services/settingsService.js';

const router = express.Router();

// GET /api/settings/model-parameters
router.get('/model-parameters', async (req, res) => {
    try {
        console.log('[SETTINGS] Getting model parameters');
        const parameters = await settingsService.getModelParameters();
        
        res.json({
            success: true,
            data: parameters
        });
    } catch (error) {
        console.error('[SETTINGS] Failed to get model parameters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get model parameters'
        });
    }
});

// POST /api/settings/model-parameters
router.post('/model-parameters', async (req, res) => {
    try {
        console.log('[SETTINGS] Updating model parameters:', req.body);
        
        const { temperature, topP, numThread } = req.body;
        
        // Validate parameters
        if (temperature !== undefined && (temperature < 0.1 || temperature > 2.0)) {
            return res.status(400).json({
                success: false,
                error: 'Temperature must be between 0.1 and 2.0'
            });
        }
        
        if (topP !== undefined && (topP < 0.1 || topP > 1.0)) {
            return res.status(400).json({
                success: false,
                error: 'Top P must be between 0.1 and 1.0'
            });
        }
        
        if (numThread !== undefined && (numThread < 1 || numThread > 64)) {
            return res.status(400).json({
                success: false,
                error: 'Thread count must be between 1 and 64'
            });
        }
        
        // Update parameters
        const updatedParameters = await settingsService.updateModelParameters({
            ...(temperature !== undefined && { temperature }),
            ...(topP !== undefined && { topP }),
            ...(numThread !== undefined && { numThread })
        });
        
        if (updatedParameters) {
            console.log('[SETTINGS] Model parameters updated successfully');
            res.json({
                success: true,
                data: updatedParameters
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to save model parameters'
            });
        }
    } catch (error) {
        console.error('[SETTINGS] Failed to update model parameters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update model parameters'
        });
    }
});

// GET /api/settings/all
router.get('/all', async (req, res) => {
    try {
        console.log('[SETTINGS] Getting all settings');
        const settings = await settingsService.getSettings();
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('[SETTINGS] Failed to get settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get settings'
        });
    }
});

// POST /api/settings/reset
router.post('/reset', async (req, res) => {
    try {
        console.log('[SETTINGS] Resetting settings to defaults');
        
        const reset = await settingsService.resetSettings();
        
        if (reset) {
            const settings = await settingsService.getSettings();
            res.json({
                success: true,
                data: settings
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to reset settings'
            });
        }
    } catch (error) {
        console.error('[SETTINGS] Failed to reset settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset settings'
        });
    }
});

export default router; 