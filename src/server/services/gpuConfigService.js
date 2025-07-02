import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GPUConfigService {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/gpu-config.json');
    this.defaultConfig = {
      enableGPU: true,
      selectedGPU: -1, // -1 means use all available GPUs
      numGPU: -1, // Number of GPUs to use (-1 for all)
      numThread: 0, // Number of threads (0 for auto)
      availableGPUs: [],
      lastDetection: null,
      forceGPU: true, // Always force GPU usage
      gpuMemoryFraction: 0.95 // Use 95% of GPU memory
    };
    
    this.ensureConfigDirectory();
    this.loadConfig();
    
    // Auto-detect and configure NVIDIA GPUs on startup
    this.initializeNvidiaGPU();
  }

  // Initialize NVIDIA GPU configuration on startup
  async initializeNvidiaGPU() {
    try {
      console.log('[GPU] Initializing NVIDIA GPU configuration...');
      
      // Only auto-configure if no specific GPU is selected
      if (this.config.selectedGPU === -1 || this.config.selectedGPU === undefined) {
        const gpus = await this.detectGPUs();
        const nvidiaGPUs = gpus.filter(gpu => gpu.isNVIDIA);
        
        if (nvidiaGPUs.length > 0) {
          console.log(`[GPU] Found ${nvidiaGPUs.length} NVIDIA GPU(s) on startup, auto-configuring...`);
          this.config.enableGPU = true;
          this.config.selectedGPU = nvidiaGPUs[0].id;
          this.config.numGPU = nvidiaGPUs.length;
          this.config.forceGPU = true;
          this.config.gpuMemoryFraction = 0.95;
          this.saveConfig();
          
          console.log(`[GPU] Auto-configured NVIDIA GPU: ${nvidiaGPUs[0].name} (ID: ${nvidiaGPUs[0].id})`);
        }
      }
    } catch (error) {
      console.log('[GPU] Failed to initialize NVIDIA GPU configuration:', error.message);
    }
  }

  ensureConfigDirectory() {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...this.defaultConfig, ...JSON.parse(configData) };
      } else {
        this.config = { ...this.defaultConfig };
        this.saveConfig();
      }
    } catch (error) {
      console.error('Error loading GPU config:', error);
      this.config = { ...this.defaultConfig };
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving GPU config:', error);
    }
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    return this.config;
  }

  // Detect available GPUs with enhanced NVIDIA detection
  async detectGPUs() {
    try {
      const { execAsync } = await import('../utils/processUtils.js');
      let gpus = [];

      console.log('[GPU] Starting GPU detection...');

      if (process.platform === 'win32') {
        // Method 1: Try nvidia-smi first for NVIDIA cards with detailed memory info
        try {
          console.log('[GPU] Trying nvidia-smi for NVIDIA detection...');
          const nvidiaResult = await execAsync('nvidia-smi --query-gpu=index,name,memory.total,memory.free,memory.used --format=csv,noheader,nounits');
          const nvidiaLines = nvidiaResult.stdout.split('\n').filter(line => line.trim());
          
          for (let i = 0; i < nvidiaLines.length; i++) {
            const parts = nvidiaLines[i].split(',').map(part => part.trim());
            if (parts.length >= 3) {
              const [index, name, memoryTotal, memoryFree, memoryUsed] = parts;
              const totalMB = parseInt(memoryTotal) || 0;
              const freeMB = parseInt(memoryFree) || 0;
              const usedMB = parseInt(memoryUsed) || 0;
              
              gpus.push({
                id: parseInt(index) || i,
                name: name || `NVIDIA GPU ${i}`,
                memory: `${totalMB} MB`,
                memoryTotal: totalMB,
                memoryFree: freeMB,
                memoryUsed: usedMB,
                type: 'NVIDIA',
                vendor: 'NVIDIA',
                isNVIDIA: true
              });
            }
          }
          console.log(`[GPU] Found ${gpus.length} NVIDIA GPU(s) via nvidia-smi`);
        } catch (error) {
          console.log('[GPU] nvidia-smi not available, trying wmic...');
        }

        // Method 2: Use wmic as fallback
        if (gpus.length === 0) {
          try {
            const result = await execAsync('wmic path win32_VideoController get name,AdapterRAM,PNPDeviceID /format:csv');
            const lines = result.stdout.split('\n').filter(line => line.includes(',') && !line.includes('Node'));
            
            gpus = lines.map((line, index) => {
              const parts = line.split(',').map(part => part.trim());
              if (parts.length >= 4) {
                const name = parts[2] || `GPU ${index}`;
                const ram = parts[1];
                const deviceId = parts[3] || '';
                
                // Better NVIDIA detection
                const isNVIDIA = name.toLowerCase().includes('nvidia') || 
                               name.toLowerCase().includes('geforce') || 
                               name.toLowerCase().includes('quadro') || 
                               name.toLowerCase().includes('tesla') ||
                               deviceId.toLowerCase().includes('ven_10de'); // NVIDIA vendor ID

                const isAMD = name.toLowerCase().includes('amd') || 
                             name.toLowerCase().includes('radeon') ||
                             deviceId.toLowerCase().includes('ven_1002'); // AMD vendor ID

                let memoryStr = 'Unknown';
                if (ram && ram !== 'null' && !isNaN(ram)) {
                  const memoryMB = Math.round(parseInt(ram) / (1024 * 1024));
                  memoryStr = `${memoryMB} MB`;
                }

                return {
                  id: index,
                  name: name,
                  memory: memoryStr,
                  type: isNVIDIA ? 'NVIDIA' : (isAMD ? 'AMD' : 'Unknown'),
                  vendor: isNVIDIA ? 'NVIDIA' : (isAMD ? 'AMD' : 'Unknown'),
                  isNVIDIA: isNVIDIA,
                  deviceId: deviceId
                };
              }
              return null;
            }).filter(Boolean);
            
            console.log(`[GPU] Found ${gpus.length} GPU(s) via wmic`);
          } catch (error) {
            console.log('[GPU] wmic detection failed:', error.message);
          }
        }

        // Method 3: Try DirectX info as final fallback
        if (gpus.length === 0) {
          try {
            const dxResult = await execAsync('dxdiag /t dxdiag_temp.txt && type dxdiag_temp.txt && del dxdiag_temp.txt');
            // Parse DirectX output for GPU info (simplified)
            if (dxResult.stdout.toLowerCase().includes('nvidia')) {
              gpus.push({
                id: 0,
                name: 'NVIDIA GPU (DirectX detected)',
                memory: 'Unknown',
                type: 'NVIDIA',
                vendor: 'NVIDIA',
                isNVIDIA: true
              });
            }
          } catch (error) {
            console.log('[GPU] DirectX detection failed');
          }
        }

      } else {
        // Linux/Mac: Enhanced detection
        try {
          let result;
          if (process.platform === 'darwin') {
            // macOS
            result = await execAsync('system_profiler SPDisplaysDataType');
          } else {
            // Linux - try multiple methods
            try {
              // Try nvidia-smi first
              const nvidiaResult = await execAsync('nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits');
              const nvidiaLines = nvidiaResult.stdout.split('\n').filter(line => line.trim());
              
              for (let i = 0; i < nvidiaLines.length; i++) {
                const parts = nvidiaLines[i].split(',').map(part => part.trim());
                if (parts.length >= 3) {
                  const [index, name, memory] = parts;
                  gpus.push({
                    id: parseInt(index) || i,
                    name: name || `NVIDIA GPU ${i}`,
                    memory: `${memory} MB`,
                    type: 'NVIDIA',
                    vendor: 'NVIDIA',
                    isNVIDIA: true
                  });
                }
              }
            } catch (nvidiaError) {
              // Fallback to lspci
              result = await execAsync('lspci | grep -i vga');
            }
          }
          
          if (gpus.length === 0 && result) {
            // Parse lspci/system_profiler result
            const lines = result.stdout.split('\n').filter(line => line.trim());
            gpus = lines.map((line, index) => {
              const name = line.includes(':') ? line.split(':')[1]?.trim() : `GPU ${index}`;
              const isNVIDIA = line.toLowerCase().includes('nvidia');
              const isAMD = line.toLowerCase().includes('amd');
              
              return {
                id: index,
                name: name,
                memory: 'Unknown',
                type: isNVIDIA ? 'NVIDIA' : (isAMD ? 'AMD' : 'Unknown'),
                vendor: isNVIDIA ? 'NVIDIA' : (isAMD ? 'AMD' : 'Unknown'),
                isNVIDIA: isNVIDIA
              };
            });
          }
        } catch (error) {
          console.log('[GPU] Linux/Mac GPU detection failed:', error.message);
        }
      }

      // Filter out integrated/unsupported GPUs and prioritize NVIDIA
      gpus = gpus.filter(gpu => 
        !gpu.name.toLowerCase().includes('microsoft basic') &&
        !gpu.name.toLowerCase().includes('generic pnp')
      );

      // If we found NVIDIA GPUs, prioritize them
      const nvidiaGPUs = gpus.filter(gpu => gpu.isNVIDIA);
      if (nvidiaGPUs.length > 0) {
        console.log(`[GPU] Prioritizing ${nvidiaGPUs.length} NVIDIA GPU(s)`);
        gpus = [...nvidiaGPUs, ...gpus.filter(gpu => !gpu.isNVIDIA)];
      }

      // If no GPUs detected, add a fallback entry
      if (gpus.length === 0) {
        console.log('[GPU] No GPUs detected, adding fallback entry');
        gpus = [{
          id: 0,
          name: 'Default GPU',
          memory: 'Unknown',
          type: 'Unknown',
          vendor: 'Unknown',
          isNVIDIA: false
        }];
      }

      console.log(`[GPU] Final detection result: ${gpus.length} GPU(s)`);
      gpus.forEach((gpu, i) => {
        console.log(`[GPU] ${i}: ${gpu.name} (${gpu.type}) - ${gpu.memory}`);
      });

      // Update config with detected GPUs
      this.config.availableGPUs = gpus;
      this.config.lastDetection = new Date().toISOString();
      
      // Auto-configure NVIDIA GPU if detected and not already configured
      const detectedNvidiaGPUs = gpus.filter(gpu => gpu.isNVIDIA);
      if (detectedNvidiaGPUs.length > 0 && (this.config.selectedGPU === -1 || this.config.selectedGPU === undefined)) {
        console.log(`[GPU] Auto-configuring NVIDIA GPU: ${detectedNvidiaGPUs[0].name}`);
        this.config.enableGPU = true;
        this.config.selectedGPU = detectedNvidiaGPUs[0].id;
        this.config.numGPU = detectedNvidiaGPUs.length;
        this.config.forceGPU = true;
        this.config.gpuMemoryFraction = 0.95;
        console.log(`[GPU] NVIDIA GPU auto-configuration completed for GPU ${detectedNvidiaGPUs[0].id}`);
      }
      
      this.saveConfig();

      return gpus;
    } catch (error) {
      console.error('[GPU] Error detecting GPUs:', error);
      return this.config.availableGPUs || [];
    }
  }

  // Calculate optimal GPU memory usage based on available VRAM
  calculateOptimalGPUConfig(gpu) {
    if (!gpu || !gpu.isNVIDIA || !gpu.memoryTotal) {
      return { 
        memoryFraction: 0.8, 
        recommendedLayers: -1,
        usableVRAM: 0,
        totalVRAM: 0,
        gpuClass: 'unknown'
      };
    }

    const totalVRAM = gpu.memoryTotal; // in MB
    const freeVRAM = gpu.memoryFree || (totalVRAM * 0.9); // Assume 90% free if not available
    
    console.log(`[GPU] 📊 VRAM Analysis for ${gpu.name}:`);
    console.log(`[GPU]   Total VRAM: ${totalVRAM} MB (${(totalVRAM/1024).toFixed(1)} GB)`);
    console.log(`[GPU]   Free VRAM: ${freeVRAM} MB (${(freeVRAM/1024).toFixed(1)} GB)`);
    
    let memoryFraction = 0.8;
    let recommendedLayers = -1; // Default: all layers
    
    // Dynamic configuration based on VRAM size
    if (totalVRAM >= 20000) {
      // RTX 4090, RTX 6000 Ada, etc. (20GB+)
      memoryFraction = 0.95;
      console.log(`[GPU] 🚀 High-end GPU detected (${(totalVRAM/1024).toFixed(1)}GB) - Maximum performance mode`);
    } else if (totalVRAM >= 12000) {
      // RTX 4070 Ti Super, RTX 3060 12GB, etc. (12-20GB)
      memoryFraction = 0.92;
      console.log(`[GPU] 💪 Mid-high GPU detected (${(totalVRAM/1024).toFixed(1)}GB) - High performance mode`);
    } else if (totalVRAM >= 8000) {
      // RTX 3060 Ti, RTX 4060 Ti, etc. (8-12GB)
      memoryFraction = 0.90;
      console.log(`[GPU] 🎯 Mid-range GPU detected (${(totalVRAM/1024).toFixed(1)}GB) - Optimized performance mode`);
    } else if (totalVRAM >= 6000) {
      // RTX 3060, RTX 4060, etc. (6-8GB)
      memoryFraction = 0.85;
      console.log(`[GPU] ⚡ Entry-level GPU detected (${(totalVRAM/1024).toFixed(1)}GB) - Balanced mode`);
    } else {
      // Lower VRAM GPUs (4-6GB)
      memoryFraction = 0.75;
      console.log(`[GPU] 💡 Limited VRAM GPU detected (${(totalVRAM/1024).toFixed(1)}GB) - Conservative mode`);
    }
    
    const usableVRAM = totalVRAM * memoryFraction;
    console.log(`[GPU] 🔧 Optimal configuration:`);
    console.log(`[GPU]   Memory fraction: ${(memoryFraction * 100).toFixed(0)}%`);
    console.log(`[GPU]   Usable VRAM: ${usableVRAM.toFixed(0)} MB (${(usableVRAM/1024).toFixed(1)} GB)`);
    console.log(`[GPU]   GPU layers: ALL (-1) for maximum performance`);
    
    return {
      memoryFraction,
      recommendedLayers,
      usableVRAM: usableVRAM,
      totalVRAM: totalVRAM,
      gpuClass: this.getGPUClass(totalVRAM)
    };
  }

  // Classify GPU based on VRAM
  getGPUClass(vramMB) {
    if (vramMB >= 20000) return 'flagship'; // RTX 4090, etc.
    if (vramMB >= 12000) return 'high-end'; // RTX 4070 Ti Super, etc.
    if (vramMB >= 8000) return 'mid-range'; // RTX 3060 Ti, RTX 4060 Ti
    if (vramMB >= 6000) return 'entry-level'; // RTX 3060, RTX 4060
    return 'budget'; // Lower VRAM
  }

  // Get Ollama options based on current config with NVIDIA GPU priority
  getOllamaOptions() {
    const options = {};

    // Always check for NVIDIA GPUs first
    const nvidiaGPUs = this.config.availableGPUs?.filter(gpu => gpu.isNVIDIA) || [];
    const hasNvidiaGPU = nvidiaGPUs.length > 0;

    // Force GPU acceleration if NVIDIA GPU is available
    if (this.config.enableGPU !== false && hasNvidiaGPU) {
      const primaryNvidiaGPU = nvidiaGPUs[0];
      
      // Calculate optimal configuration based on GPU VRAM
      const optimalConfig = this.calculateOptimalGPUConfig(primaryNvidiaGPU);
      
      console.log(`[GPU] 🎯 NVIDIA ${primaryNvidiaGPU.name} DYNAMIC OPTIMIZATION ACTIVATED`);
      console.log(`[GPU] 🚀 GPU Class: ${(optimalConfig.gpuClass || 'unknown').toUpperCase()}`);
      
      // CRITICAL: num_gpu_layers should NOT be passed as option to Ollama API
      // It should be set via environment variable OLLAMA_GPU_LAYERS=-1
      // Only pass runtime options that Ollama API actually supports
      
      // Dynamic thread optimization based on GPU class
      let optimalThreads = 4; // Default for mid-range
      const gpuClass = optimalConfig.gpuClass || 'mid-range';
      if (gpuClass === 'flagship') {
        optimalThreads = 8; // RTX 4090, etc.
      } else if (gpuClass === 'high-end') {
        optimalThreads = 6; // RTX 4070 Ti Super, etc.
      } else if (gpuClass === 'mid-range') {
        optimalThreads = 4;  // RTX 3060 Ti, RTX 4060 Ti
      } else if (gpuClass === 'entry-level') {
        optimalThreads = 3;  // RTX 3060, RTX 4060
      } else {
        optimalThreads = 2;  // Budget GPUs or unknown
      }
      
      options.num_thread = optimalThreads;
      // Note: temperature and top_p are now managed by settingsService
      
      console.log(`[GPU] ⚡ Dynamic NVIDIA Configuration Applied:`);
      console.log(`[GPU]   GPU: ${primaryNvidiaGPU.name} (ID: ${primaryNvidiaGPU.id})`);
      console.log(`[GPU]   VRAM: ${(optimalConfig.totalVRAM/1024).toFixed(1)}GB total, ${(optimalConfig.usableVRAM/1024).toFixed(1)}GB usable (${(optimalConfig.memoryFraction*100).toFixed(0)}%)`);
      console.log(`[GPU]   ALL layers FORCED to GPU via OLLAMA_GPU_LAYERS=-1`);
      console.log(`[GPU]   Threads: ${optimalThreads} (optimized for ${gpuClass} GPU)`);
      console.log(`[GPU]   Expected performance: ${this.getExpectedPerformance(gpuClass)} tokens/second`);
      console.log(`[GPU]   ⚠️  GPU layers controlled by environment variable, not API options`);
      
      // Store optimal config for environment variable setting
      this.lastOptimalConfig = optimalConfig;
      
    } else if (this.config.enableGPU !== false) {
      // Fallback for non-NVIDIA GPUs
      console.log('[GPU] ⚠️ No NVIDIA GPU detected, using standard GPU configuration');
      
      options.num_thread = this.config.numThread || 4;
      // Note: temperature and top_p are now managed by settingsService
      
    } else {
      // GPU explicitly disabled
      options.num_thread = this.config.numThread || 4;
      // Note: temperature and top_p are now managed by settingsService
      console.log('[GPU] ❌ GPU acceleration disabled by user');
    }

    console.log('[GPU] 📋 Final Ollama API options (ONLY valid parameters):', JSON.stringify(options, null, 2));
    return options;
  }

  // Get expected performance based on GPU class
  getExpectedPerformance(gpuClass) {
    switch (gpuClass) {
      case 'flagship': return '50-100+'; // RTX 4090
      case 'high-end': return '30-60';   // RTX 4070 Ti Super
      case 'mid-range': return '20-40';  // RTX 3060 Ti
      case 'entry-level': return '15-25'; // RTX 3060
      case 'budget': return '10-20';     // Lower VRAM
      default: return '15-30';
    }
  }

  // Get optimal memory fraction for environment variable
  getOptimalMemoryFraction() {
    return this.lastOptimalConfig?.memoryFraction || 0.90;
  }

  // Reset to default configuration
  resetToDefaults() {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
    return this.config;
  }
}

export default new GPUConfigService(); 