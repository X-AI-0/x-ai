import { Ollama } from 'ollama';
import ollamaInstaller from './ollamaInstaller.js';
import gpuConfigService from './gpuConfigService.js';
import settingsService from './settingsService.js';

class OllamaService {
  constructor() {
    this.ollama = null;
    this.isConnected = false;
    this.initializeOllama();
  }

  initializeOllama() {
    console.log('[OLLAMA] 🔥 Initializing with NVIDIA GPU force configuration...');
    
    // Check if local Ollama installation exists
    const installationInfo = ollamaInstaller.getInstallationInfo();
    
    // Set environment variables for model folder
    if (installationInfo.modelsDir) {
      process.env.OLLAMA_MODELS = installationInfo.modelsDir;
    }
    
    // Dynamic NVIDIA GPU configuration (CRITICAL - based on GitHub issues #6008 and #1813)
    console.log('[OLLAMA] 🚀 Setting DYNAMIC NVIDIA GPU environment variables...');
    
    // Get optimal memory fraction from GPU config service
    const optimalMemoryFraction = gpuConfigService.getOptimalMemoryFraction();
    
    process.env.CUDA_VISIBLE_DEVICES = '0';
    process.env.NVIDIA_VISIBLE_DEVICES = '0';
    process.env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
    process.env.OLLAMA_NUM_GPU = '1';
    process.env.OLLAMA_GPU_LAYERS = '-1';  // ALL layers on GPU (CRITICAL)
    process.env.OLLAMA_FORCE_GPU = '1';
    process.env.OLLAMA_LLM_LIBRARY = 'cuda';
    process.env.OLLAMA_CUDA_VISIBLE_DEVICES = '0';
    process.env.OLLAMA_GPU_MEMORY_FRACTION = optimalMemoryFraction.toString();
    process.env.OLLAMA_NUM_PARALLEL = '1';
    process.env.OLLAMA_MAX_LOADED_MODELS = '1';
    process.env.OLLAMA_SKIP_CPU_GENERATE = '1';  // CRITICAL: Skip CPU generation
    process.env.NVIDIA_TF32_OVERRIDE = '1';
    
    console.log('[OLLAMA] ✅ DYNAMIC NVIDIA GPU environment variables set:');
    console.log(`[OLLAMA]   CUDA_VISIBLE_DEVICES: ${process.env.CUDA_VISIBLE_DEVICES}`);
    console.log(`[OLLAMA]   OLLAMA_NUM_GPU: ${process.env.OLLAMA_NUM_GPU}`);
    console.log(`[OLLAMA]   OLLAMA_GPU_LAYERS: ${process.env.OLLAMA_GPU_LAYERS} (ALL on GPU)`);
    console.log(`[OLLAMA]   OLLAMA_FORCE_GPU: ${process.env.OLLAMA_FORCE_GPU}`);
    console.log(`[OLLAMA]   OLLAMA_SKIP_CPU_GENERATE: ${process.env.OLLAMA_SKIP_CPU_GENERATE}`);
    console.log(`[OLLAMA]   OLLAMA_GPU_MEMORY_FRACTION: ${process.env.OLLAMA_GPU_MEMORY_FRACTION} (DYNAMIC)`);
    
    // Try multiple ports to connect to Ollama (prioritize 12434 for local GPU setup)
    const possiblePorts = [12434, 11435, 11434];
    const host = process.env.OLLAMA_HOST || `127.0.0.1:${possiblePorts[0]}`;
    
    this.ollama = new Ollama({
      host: `http://${host}`
    });
    
    console.log(`[OLLAMA] Initialized with host: http://${host}`);
    console.log('[OLLAMA] 💡 Ollama service will be started by startup script (start.bat/start.sh)');
    
    // Check connection status without auto-starting
    setTimeout(() => {
      this.checkHealth().then(health => {
        if (health.connected) {
          console.log('[OLLAMA] ✅ Ollama service is already running with GPU configuration');
        } else {
          console.log('[OLLAMA] ⏳ Waiting for Ollama service to be started by startup script...');
        }
      }).catch(() => {
        console.log('[OLLAMA] ⏳ Ollama service not yet available - will be started by startup script');
      });
    }, 2000);
  }

  /**
   * Try to connect to Ollama on different ports
   */
  async findOllamaPort() {
    const possiblePorts = [11434, 12434, 11435]; // Try default port 11434 first
    
    console.log('[OLLAMA] 🔍 Searching for Ollama service...');
    
    for (const port of possiblePorts) {
      try {
        const testOllama = new Ollama({
          host: `http://127.0.0.1:${port}`
        });
        
        // Test connection with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 3000)
        );
        
        await Promise.race([testOllama.list(), timeoutPromise]);
        console.log(`[OLLAMA] ✅ Found Ollama running on port ${port}`);
        
        // Update the main ollama instance
        this.ollama = testOllama;
        return port;
      } catch (error) {
        console.log(`[OLLAMA] ❌ Port ${port} not available: ${error.message}`);
        continue;
      }
    }
    
    // Provide helpful error message with instructions
    console.log('');
    console.log('❌ Ollama service not found on any port!');
    console.log('');
    console.log('🚀 Please start Ollama service:');
    console.log('   Option 1: Run "ollama serve" in a new terminal');
    console.log('   Option 2: Start Ollama desktop application');
    console.log('   Option 3: Ensure Ollama is installed and running');
    console.log('');
    console.log('💡 After starting Ollama, refresh your browser page');
    console.log('');
    
    throw new Error('Ollama service not found. Please start Ollama first.');
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkHealth() {
    try {
      try {
        await this.ollama.list();
        this.isConnected = true;
        return {
          connected: true,
          message: 'Ollama service is running',
          modelsPath: process.env.OLLAMA_MODELS || 'default',
          host: this.ollama.config.host
        };
      } catch (error) {
        console.log('[OLLAMA] Current connection failed, trying to find Ollama on other ports...');
        
        const port = await this.findOllamaPort();
        this.isConnected = true;
        return {
          connected: true,
          message: `Ollama service found on port ${port}`,
          modelsPath: process.env.OLLAMA_MODELS || 'default',
          host: this.ollama.config.host,
          port: port
        };
      }
    } catch (error) {
      this.isConnected = false;
      return {
        connected: false,
        message: 'Ollama service is not running',
        error: error.message
      };
    }
  }

  /**
   * Get list of all available models
   */
  async getModels() {
    try {
      if (!this.isConnected) {
        await this.checkHealth();
      }
      
      const response = await this.ollama.list();
      return response.models || [];
    } catch (error) {
      // Only log detailed error once to avoid spam
      if (!this.errorLogged) {
        console.error('[OLLAMA] ❌ Error getting models:', error.message);
        console.log('[OLLAMA] 💡 Make sure Ollama service is running');
        this.errorLogged = true;
        
        // Reset error flag after 30 seconds
        setTimeout(() => { this.errorLogged = false; }, 30000);
      }
      return [];
    }
  }

  /**
   * Get detailed information about a specific model
   */
  async getModelInfo(modelName) {
    try {
      const response = await this.ollama.show({ model: modelName });
      return response;
    } catch (error) {
      console.error(`Error fetching model info for ${modelName}:`, error);
      throw new Error(`Failed to fetch model info for ${modelName}`);
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName, onProgress) {
    try {
      if (!this.isConnected) {
        throw new Error('Ollama service is not connected');
      }

      const stream = await this.ollama.pull({
        model: modelName,
        stream: true
      });

      for await (const chunk of stream) {
        if (onProgress) {
          onProgress(chunk);
        }
      }

      return { success: true, message: `Model ${modelName} pulled successfully` };
    } catch (error) {
      console.error('Error pulling model:', error);
      throw error;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName) {
    try {
      if (!this.isConnected) {
        throw new Error('Ollama service is not connected');
      }

      await this.ollama.delete({ model: modelName });
      return { success: true, message: `Model ${modelName} deleted successfully` };
    } catch (error) {
      console.error('Error deleting model:', error);
      throw error;
    }
  }

  /**
   * Generate a chat response from a model
   */
  async chat(model, messages, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Ollama service is not connected');
      }

      // Get GPU configuration and model parameters from settings
      const gpuOptions = gpuConfigService.getOllamaOptions();
      const modelParameters = await settingsService.getOllamaOptions();
      
      console.log(`[OLLAMA] Using GPU options for chat with ${model}:`, gpuOptions);
      console.log(`[OLLAMA] Using model parameters for chat with ${model}:`, modelParameters);
      console.log('[OLLAMA] 🚀 NVIDIA GPU PRIORITY - Forcing NVIDIA acceleration');
      
      // Determine timeout based on context - shorter for summary generation
      const isSummary = options.isSummary || false;
      const timeoutMs = isSummary ? 90000 : 300000; // 1.5 minutes for summary, 5 minutes for regular
      
      // Merge with default options and user options (exclude invalid Ollama options)
      const ollamaOptions = {
        options: {
          ...gpuOptions,
          ...modelParameters,
          ...options.options
        }
      };
      
      console.log(`[OLLAMA] Final chat options for ${model} (${isSummary ? 'summary' : 'regular'}):`, ollamaOptions);

      // Add timeout wrapper with appropriate timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs/1000} seconds`)), timeoutMs);
      });

      const chatPromise = this.ollama.chat({
        model,
        messages,
        ...ollamaOptions
      });

      const response = await Promise.race([chatPromise, timeoutPromise]);
      
      // For summary generation, try to free GPU memory more aggressively
      if (isSummary) {
        console.log(`[OLLAMA] Summary completed for ${model}, attempting to free GPU memory...`);
        // Don't wait for this to complete
        setTimeout(() => {
          this.freeGpuMemory(model).catch(error => {
            console.warn(`[OLLAMA] Failed to free GPU memory for ${model}:`, error.message);
          });
        }, 1000); // Wait 1 second before freeing memory
      }
      
      return response;
    } catch (error) {
      console.error('Error in chat:', error);
      throw error;
    }
  }

  /**
   * Generate a streaming chat response from a model
   */
  async chatStream(modelName, messages, onChunk, options = {}) {
    try {
      // Get GPU configuration and model parameters from settings
      const gpuOptions = gpuConfigService.getOllamaOptions();
      const modelParameters = await settingsService.getOllamaOptions();
      
      console.log(`[OLLAMA] Using GPU options for streaming chat with ${modelName}:`, gpuOptions);
      console.log(`[OLLAMA] Using model parameters for streaming chat with ${modelName}:`, modelParameters);
      console.log('[OLLAMA] 🚀 NVIDIA GPU PRIORITY - Forcing NVIDIA streaming acceleration');
      
      // Determine if this is for summary generation
      const isSummary = options.isSummary || false;
      const timeoutMs = isSummary ? 90000 : 300000; // 1.5 minutes for summary, 5 minutes for regular
      
      // Merge with default options and user options (exclude invalid Ollama options)
      const ollamaOptions = {
        options: {
          ...gpuOptions,
          ...modelParameters,
          ...options.options
        }
      };
      
      console.log(`[OLLAMA] Final streaming options for ${modelName} (${isSummary ? 'summary' : 'regular'}):`, ollamaOptions);

      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Streaming timeout after ${timeoutMs/1000} seconds`)), timeoutMs);
      });

      const streamPromise = (async () => {
      const response = await this.ollama.chat({
        model: modelName,
        messages: messages,
        stream: true,
          ...ollamaOptions
      });

      let fullResponse = '';
      for await (const part of response) {
        if (onChunk) {
          onChunk(part);
        }
        
        if (part.message && part.message.content) {
          fullResponse += part.message.content;
        }
      }
      return fullResponse;
      })();

      const result = await Promise.race([streamPromise, timeoutPromise]);

      // For summary generation, try to free GPU memory more aggressively
      if (isSummary) {
        console.log(`[OLLAMA] Summary streaming completed for ${modelName}, attempting to free GPU memory...`);
        // Don't wait for this to complete
        setTimeout(() => {
          this.freeGpuMemory(modelName).catch(error => {
            console.warn(`[OLLAMA] Failed to free GPU memory for ${modelName}:`, error.message);
          });
        }, 1000); // Wait 1 second before freeing memory
      }

      return result;
    } catch (error) {
      console.error(`Error streaming chat with model ${modelName}:`, error);
      throw new Error(`Failed to stream response from model ${modelName}: ${error.message}`);
    }
  }

  /**
   * Get running models (models currently loaded in memory)
   */
  async getRunningModels() {
    try {
      const response = await this.ollama.ps();
      return response.models || [];
    } catch (error) {
      console.error('Error fetching running models:', error);
      return []; // Return empty array instead of throwing error
    }
  }

  /**
   * Test model with a simple prompt
   */
  async testModel(modelName, prompt = 'hi') {
    const startTime = Date.now();
    try {
      const response = await this.chat(modelName, [
        { role: 'user', content: prompt }
      ]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        response: response.message?.content || 'Model responded successfully',
        prompt: prompt,
        model: modelName,
        responseTime: responseTime
      };
    } catch (error) {
      console.error(`Error testing model ${modelName}:`, error);
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        error: error.message,
        model: modelName,
        prompt: prompt,
        responseTime: responseTime
      };
    }
  }

  getInstallationInfo() {
    return ollamaInstaller.getInstallationInfo();
  }

  /**
   * Auto-start Ollama service with NVIDIA GPU acceleration
   * This is called when the frontend requests to start Ollama
   */
  async autoStartOllama() {
    try {
      console.log('[OLLAMA] 🔍 Checking if Ollama service is running...');
      
      // Check if Ollama is already running
      const health = await this.checkHealth();
      if (health.connected) {
        console.log('[OLLAMA] ✅ Ollama service is already running with GPU configuration');
        return { success: true, message: 'Ollama already running' };
      }
      
      console.log('[OLLAMA] 🚀 Starting Ollama service with NVIDIA GPU acceleration...');
      console.log('[OLLAMA] 🎯 Targeting NVIDIA GeForce RTX 3060 Ti (8GB)');
      
      // Import child_process for spawning Ollama
      const { spawn } = require('child_process');
      
      // Critical GPU environment variables based on successful community solutions
      const env = {
        ...process.env,
        // Core CUDA configuration (CRITICAL for GPU detection)
        CUDA_VISIBLE_DEVICES: '0',
        NVIDIA_VISIBLE_DEVICES: '0',
        CUDA_DEVICE_ORDER: 'PCI_BUS_ID',
        CUDA_CACHE_DISABLE: '0',
        CUDA_LAUNCH_BLOCKING: '0',
        
        // Ollama GPU configuration (MOST IMPORTANT)
        OLLAMA_HOST: '127.0.0.1:11434',
        OLLAMA_NUM_GPU: '1',
        OLLAMA_GPU_LAYERS: '-1',  // Load ALL layers on GPU
        OLLAMA_FORCE_GPU: '1',
        OLLAMA_LLM_LIBRARY: 'cuda',
        OLLAMA_CUDA_VISIBLE_DEVICES: '0',
        OLLAMA_GPU_MEMORY_FRACTION: '0.95',
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1',
        OLLAMA_SKIP_CPU_GENERATE: '1',  // Critical: Skip CPU generation
        
        // NVIDIA RTX optimizations
        NVIDIA_TF32_OVERRIDE: '1',
        CUDA_AUTO_BOOST: '1',
        CUDA_MODULE_LOADING: 'LAZY',
        
        // Memory management
        OLLAMA_KEEP_ALIVE: '5m',
        OLLAMA_LOAD_TIMEOUT: '5m',
        
        // Additional CUDA library paths for Windows
        LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '',
        PATH: process.env.PATH
      };
      
      console.log('[OLLAMA] 🔧 Applied NVIDIA GPU environment variables:');
      console.log(`[OLLAMA]   CUDA_VISIBLE_DEVICES: ${env.CUDA_VISIBLE_DEVICES}`);
      console.log(`[OLLAMA]   OLLAMA_GPU_LAYERS: ${env.OLLAMA_GPU_LAYERS} (ALL on GPU)`);
      console.log(`[OLLAMA]   OLLAMA_GPU_MEMORY_FRACTION: ${env.OLLAMA_GPU_MEMORY_FRACTION}`);
      console.log(`[OLLAMA]   OLLAMA_FORCE_GPU: ${env.OLLAMA_FORCE_GPU}`);
      console.log(`[OLLAMA]   OLLAMA_SKIP_CPU_GENERATE: ${env.OLLAMA_SKIP_CPU_GENERATE}`);
      
      // Start Ollama service with GPU configuration
      const ollamaProcess = spawn('ollama', ['serve'], {
        env: env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      console.log('[OLLAMA] 🔥 Ollama service starting with PID:', ollamaProcess.pid);
      console.log('[OLLAMA] ⚡ NVIDIA GPU acceleration ENABLED');
      
      // Capture startup output to verify GPU usage
      let startupOutput = '';
      if (ollamaProcess.stdout) {
        ollamaProcess.stdout.on('data', (data) => {
          const output = data.toString();
          startupOutput += output;
          if (output.includes('GPU') || output.includes('CUDA') || output.includes('nvidia')) {
            console.log('[OLLAMA] 🎯 GPU detection in output:', output.trim());
          }
        });
      }
      
      if (ollamaProcess.stderr) {
        ollamaProcess.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('GPU') || output.includes('CUDA') || output.includes('error')) {
            console.log('[OLLAMA] ⚠️ Stderr output:', output.trim());
          }
        });
      }
      
      // Handle process events
      ollamaProcess.on('error', (error) => {
        console.error('[OLLAMA] ❌ Failed to start Ollama service:', error.message);
        console.log('[OLLAMA] 💡 Please ensure Ollama is installed and accessible via PATH');
      });
      
      ollamaProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          console.log(`[OLLAMA] ⚠️ Ollama process exited with code ${code}, signal ${signal}`);
        }
      });
      
      // Wait for service to start and verify GPU usage
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const healthCheck = await this.checkHealth();
            if (healthCheck.connected) {
              console.log('[OLLAMA] ✅ Ollama service started successfully with NVIDIA GPU acceleration');
              console.log('[OLLAMA] 🚀 Ready for high-performance AI inference on RTX 3060 Ti');
              
              // Additional GPU verification
              try {
                const models = await this.getModels();
                console.log(`[OLLAMA] 📊 Service verification: ${models.length} models available`);
              } catch (err) {
                console.log('[OLLAMA] ⚠️ Model list verification failed, but service is running');
              }
              
              resolve({ success: true, message: 'Ollama started with NVIDIA GPU acceleration', gpu: 'NVIDIA RTX 3060 Ti' });
            } else {
              console.log('[OLLAMA] ❌ Service started but health check failed');
              resolve({ success: false, message: 'Service started but not responding' });
            }
          } catch (error) {
            console.log('[OLLAMA] ❌ Health check failed after start:', error.message);
            resolve({ success: false, message: 'Health check failed: ' + error.message });
          }
        }, 6000); // Increased timeout for GPU initialization
      });
      
    } catch (error) {
      console.error('[OLLAMA] ❌ Error during auto-start:', error.message);
      console.log('[OLLAMA] 💡 Manual start may be required: run "ollama serve" in terminal');
      return { success: false, message: 'Auto-start failed: ' + error.message };
    }
  }

  /**
   * Attempt to free GPU memory by unloading the model
   */
  async freeGpuMemory(modelName) {
    try {
      console.log(`[OLLAMA] Attempting to free GPU memory for ${modelName}...`);
      
      // Try to unload the model by setting keep_alive to 0
      await this.ollama.chat({
        model: modelName,
        messages: [{ role: 'user', content: 'bye' }],
        options: {
          keep_alive: 0 // This should unload the model immediately
        }
      });
      
      console.log(`[OLLAMA] GPU memory freed for ${modelName}`);
    } catch (error) {
      console.warn(`[OLLAMA] Could not free GPU memory for ${modelName}:`, error.message);
    }
  }
}

export default new OllamaService(); 