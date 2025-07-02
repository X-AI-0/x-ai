// Model Series Data - Organized by model families/series
export const modelSeries = {
  "deepseek": {
    name: "DeepSeek",
    description: "Advanced reasoning and coding models by DeepSeek AI",
    category: "reasoning",
    models: [
      // V3 Series
      {
        name: "deepseek-ai/DeepSeek-V3-Base",
        displayName: "DeepSeek V3 Base",
        description: "Base version of DeepSeek V3 model (671B parameters, 37B activated)",
        type: "Base Model",
        updated: "2024-03-27",
        downloads: "10.8k",
        likes: "1.64k",
        size: "236GB",
        tags: ["text-generation", "reasoning", "base-model", "moe"]
      },
      {
        name: "deepseek-ai/DeepSeek-V3",
        displayName: "DeepSeek V3",
        description: "Advanced reasoning model with superior performance (671B parameters)",
        type: "Text Generation",
        updated: "2024-03-27",
        downloads: "2.13M",
        likes: "3.86k",
        size: "236GB",
        tags: ["text-generation", "reasoning", "chat", "moe"],
        paper: {
          title: "DeepSeek-V3 Technical Report",
          arxiv: "2412.19437",
          published: "2024-12-27",
          citations: "63"
        }
      },
      {
        name: "deepseek-ai/DeepSeek-V3-0324",
        displayName: "DeepSeek V3 (0324)",
        description: "DeepSeek V3 checkpoint from March 24th",
        type: "Text Generation",
        updated: "2024-03-27",
        downloads: "399k",
        likes: "2.95k",
        size: "236GB",
        tags: ["text-generation", "reasoning", "checkpoint", "moe"]
      },
      // R1 Series (Using official Ollama format)
      {
        name: "deepseek-r1",
        displayName: "DeepSeek R1 (8B)",
        description: "Advanced reasoning model with chain-of-thought capabilities (8B default)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "47M",
        likes: "12.3k",
        size: "5.2GB",
        tags: ["reasoning", "chain-of-thought", "math", "coding"]
      },
      {
        name: "deepseek-r1:671b",
        displayName: "DeepSeek R1 (671B)",
        description: "Full-scale reasoning model with maximum capabilities",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "698k",
        likes: "8.9k",
        size: "404GB",
        tags: ["reasoning", "chain-of-thought", "flagship", "large-scale"]
      },
      // R1 Distilled Models (Using official Ollama format)
      {
        name: "deepseek-r1:1.5b",
        displayName: "DeepSeek R1 1.5B",
        description: "Lightweight distilled reasoning model (1.5B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "1.29M",
        likes: "1.21k",
        size: "1.1GB",
        tags: ["reasoning", "distilled", "lightweight", "efficient"]
      },
      {
        name: "deepseek-r1:7b",
        displayName: "DeepSeek R1 7B",
        description: "Mid-size distilled reasoning model (7B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "450k",
        likes: "890",
        size: "4.7GB",
        tags: ["reasoning", "distilled", "efficient", "math"]
      },
      {
        name: "deepseek-r1:8b",
        displayName: "DeepSeek R1 8B (Qwen3 Base)",
        description: "Enhanced Qwen3-based reasoning model (8B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "320k",
        likes: "678",
        size: "5.2GB",
        tags: ["reasoning", "qwen3-based", "enhanced", "coding"]
      },
      {
        name: "deepseek-r1:14b",
        displayName: "DeepSeek R1 14B",
        description: "Advanced distilled reasoning model (14B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "280k",
        likes: "567",
        size: "9.0GB",
        tags: ["reasoning", "distilled", "advanced", "problem-solving"]
      },
      {
        name: "deepseek-r1:32b",
        displayName: "DeepSeek R1 32B",
        description: "High-performance distilled reasoning model (32B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "295k",
        likes: "1.38k",
        size: "20GB",
        tags: ["reasoning", "distilled", "high-performance", "research"]
      },
      {
        name: "deepseek-r1:70b",
        displayName: "DeepSeek R1 70B",
        description: "Most powerful distilled reasoning model (70B parameters)",
        type: "Reasoning",
        updated: "2025-01-15",
        downloads: "120k",
        likes: "685",
        size: "43GB",
        tags: ["reasoning", "distilled", "powerful", "llama-based"]
      },
      // Specialized Models
      {
        name: "deepseek-ai/DeepSeek-Coder-V2",
        displayName: "DeepSeek Coder V2",
        description: "Advanced coding model with superior programming capabilities",
        type: "Code Generation",
        updated: "2024-06-17",
        downloads: "1.2M",
        likes: "4.1k",
        size: "67GB",
        tags: ["code-generation", "programming", "chat"]
      },
      {
        name: "deepseek-ai/DeepSeek-Math",
        displayName: "DeepSeek Math",
        description: "Specialized model for mathematical reasoning and problem solving",
        type: "Math Reasoning",
        updated: "2024-02-05",
        downloads: "850k",
        likes: "2.3k",
        size: "67GB",
        tags: ["math", "reasoning", "problem-solving"]
      },
      {
        name: "deepseek-ai/DeepSeek-Prover-V2-7B",
        displayName: "DeepSeek Prover V2 7B",
        description: "Mathematical theorem proving model (7B parameters)",
        type: "Mathematical Proof",
        updated: "2024-04-30",
        downloads: "45.9k",
        likes: "109",
        size: "4.1GB",
        tags: ["math", "proof", "theorem", "formal-verification"]
      },
      {
        name: "deepseek-ai/DeepSeek-Prover-V2-671B",
        displayName: "DeepSeek Prover V2 671B",
        description: "Large-scale mathematical theorem proving model",
        type: "Mathematical Proof",
        updated: "2024-04-30",
        downloads: "9.14k",
        likes: "795",
        size: "236GB",
        tags: ["math", "proof", "theorem", "large-scale"]
      }
    ]
  },
  "llama": {
    name: "Llama",
    description: "Meta's family of large language models",
    category: "general",
    models: [
      // Llama 3.2 Series (Using official Ollama format)
      {
        name: "llama3.2:1b",
        displayName: "Llama 3.2 1B",
        description: "Ultra-lightweight model for edge deployment (1B parameters)",
        type: "Text Generation",
        updated: "2024-09-25",
        downloads: "18.6M",
        likes: "5.2k",
        size: "1.3GB",
        tags: ["text-generation", "lightweight", "edge", "efficient"]
      },
      {
        name: "llama3.2:3b",
        displayName: "Llama 3.2 3B (Default)",
        description: "Small efficient model for general tasks (3B parameters, default)",
        type: "Text Generation",
        updated: "2024-09-25",
        downloads: "18.6M",
        likes: "6.8k",
        size: "2.0GB",
        tags: ["text-generation", "small", "efficient", "general", "default"]
      },
      // Llama 3.1 Series (Using official Ollama format)
      {
        name: "llama3.1:8b",
        displayName: "Llama 3.1 8B (Default)",
        description: "8 billion parameter model from Llama 3.1 series with 128K context",
        type: "Text Generation",
        updated: "2024-07-23",
        downloads: "94.6M",
        likes: "8.9k",
        size: "4.9GB",
        tags: ["text-generation", "chat", "multilingual", "default", "tools"]
      },
      {
        name: "llama3.1:70b",
        displayName: "Llama 3.1 70B",
        description: "70 billion parameter model with enhanced capabilities and 128K context",
        type: "Text Generation",
        updated: "2024-07-23",
        downloads: "94.6M",
        likes: "6.1k",
        size: "43GB",
        tags: ["text-generation", "chat", "multilingual", "large", "tools"]
      },
      {
        name: "llama3.1:405b",
        displayName: "Llama 3.1 405B",
        description: "Flagship 405 billion parameter model with state-of-the-art capabilities",
        type: "Text Generation",
        updated: "2024-07-23",
        downloads: "94.6M",
        likes: "4.2k",
        size: "243GB",
        tags: ["text-generation", "chat", "multilingual", "flagship", "tools"]
      },
      // Llama 3.3 Series (Using official Ollama format)
      {
        name: "llama3.3:70b",
        displayName: "Llama 3.3 70B",
        description: "Latest 70B model with improved reasoning capabilities, on par with 405B performance",
        type: "Text Generation",
        updated: "2024-12-06",
        downloads: "1.9M",
        likes: "4.3k",
        size: "43GB",
        tags: ["text-generation", "chat", "reasoning", "latest", "tools"]
      },
      // Code Llama
      {
        name: "codellama:7b",
        displayName: "Code Llama 7B",
        description: "Code generation model based on Llama 2 (7B parameters)",
        type: "Code Generation",
        updated: "2023-08-24",
        downloads: "2.1M",
        likes: "3.4k",
        size: "3.8GB",
        tags: ["code-generation", "programming"]
      },
      {
        name: "codellama:7b-instruct",
        displayName: "Code Llama 7B Instruct",
        description: "Instruction-tuned code generation model (7B parameters)",
        type: "Code Generation",
        updated: "2023-08-24",
        downloads: "2.1M",
        likes: "3.4k",
        size: "3.8GB",
        tags: ["code-generation", "programming", "instruct"]
      },
      {
        name: "codellama:13b",
        displayName: "Code Llama 13B",
        description: "Enhanced code generation model (13B parameters)",
        type: "Code Generation",
        updated: "2023-08-24",
        downloads: "1.5M",
        likes: "2.8k",
        size: "7.4GB",
        tags: ["code-generation", "programming"]
      },
      {
        name: "codellama:13b-instruct",
        displayName: "Code Llama 13B Instruct",
        description: "Instruction-tuned enhanced code generation model (13B parameters)",
        type: "Code Generation",
        updated: "2023-08-24",
        downloads: "1.5M",
        likes: "2.8k",
        size: "7.4GB",
        tags: ["code-generation", "programming", "instruct"]
      }
    ]
  },
  "qwen": {
    name: "Qwen",
    description: "Alibaba's Qwen series of language models",
    category: "multilingual",
    models: [
      // Qwen 2.5 Series (Latest)
      {
        name: "qwen/Qwen2.5-0.5B",
        displayName: "Qwen 2.5 0.5B",
        description: "Ultra-lightweight model for edge deployment (0.5B parameters)",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "2.8M",
        likes: "4.5k",
        size: "0.3GB",
        tags: ["text-generation", "lightweight", "edge", "multilingual"]
      },
      {
        name: "qwen/Qwen2.5-1.5B",
        displayName: "Qwen 2.5 1.5B",
        description: "Small efficient model for general tasks (1.5B parameters)",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "3.2M",
        likes: "5.1k",
        size: "0.9GB",
        tags: ["text-generation", "small", "efficient", "multilingual"]
      },
      {
        name: "qwen/Qwen2.5-3B",
        displayName: "Qwen 2.5 3B",
        description: "Compact model with strong multilingual capabilities",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "4.1M",
        likes: "6.2k",
        size: "1.8GB",
        tags: ["text-generation", "compact", "multilingual", "efficient"]
      },
      {
        name: "qwen/Qwen2.5-7B",
        displayName: "Qwen 2.5 7B",
        description: "Efficient 7B model for general use",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "5.6M",
        likes: "6.8k",
        size: "4.4GB",
        tags: ["text-generation", "multilingual", "efficient", "general"]
      },
      {
        name: "qwen/Qwen2.5-7B-Instruct",
        displayName: "Qwen 2.5 7B Instruct",
        description: "Instruction-tuned 7B model for chat and assistance",
        type: "Chat",
        updated: "2024-09-19",
        downloads: "7.2M",
        likes: "8.9k",
        size: "4.4GB",
        tags: ["chat", "instruct", "multilingual", "assistant"]
      },
      {
        name: "qwen/Qwen2.5-14B",
        displayName: "Qwen 2.5 14B",
        description: "Mid-size model balancing performance and efficiency",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "3.4M",
        likes: "4.1k",
        size: "8.4GB",
        tags: ["text-generation", "multilingual", "efficient"]
      },
      {
        name: "qwen/Qwen2.5-14B-Instruct",
        displayName: "Qwen 2.5 14B Instruct",
        description: "Instruction-tuned 14B model with enhanced reasoning",
        type: "Chat",
        updated: "2024-09-19",
        downloads: "4.1M",
        likes: "5.3k",
        size: "8.4GB",
        tags: ["chat", "instruct", "reasoning", "multilingual"]
      },
      {
        name: "qwen/Qwen2.5-32B",
        displayName: "Qwen 2.5 32B",
        description: "32 billion parameter model with strong performance",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "2.1M",
        likes: "2.8k",
        size: "19GB",
        tags: ["text-generation", "multilingual", "chinese", "english"]
      },
      {
        name: "qwen/Qwen2.5-32B-Instruct",
        displayName: "Qwen 2.5 32B Instruct",
        description: "Instruction-tuned 32B model for complex tasks",
        type: "Chat",
        updated: "2024-09-19",
        downloads: "2.8M",
        likes: "3.6k",
        size: "19GB",
        tags: ["chat", "instruct", "complex-tasks", "multilingual"]
      },
      {
        name: "qwen/Qwen2.5-72B",
        displayName: "Qwen 2.5 72B",
        description: "Latest 72B parameter model with enhanced capabilities",
        type: "Text Generation",
        updated: "2024-09-19",
        downloads: "1.8M",
        likes: "3.2k",
        size: "41GB",
        tags: ["text-generation", "multilingual", "chinese", "english"]
      },
      {
        name: "qwen/Qwen2.5-72B-Instruct",
        displayName: "Qwen 2.5 72B Instruct",
        description: "Flagship instruction-tuned model with superior performance",
        type: "Chat",
        updated: "2024-09-19",
        downloads: "2.3M",
        likes: "4.1k",
        size: "41GB",
        tags: ["chat", "instruct", "flagship", "multilingual"]
      },
      // Qwen Math Series
      {
        name: "qwen/Qwen2.5-Math-1.5B-Instruct",
        displayName: "Qwen 2.5 Math 1.5B Instruct",
        description: "Specialized math model (1.5B parameters)",
        type: "Math Reasoning",
        updated: "2024-09-19",
        downloads: "890k",
        likes: "1.8k",
        size: "0.9GB",
        tags: ["math", "reasoning", "lightweight", "specialized"]
      },
      {
        name: "qwen/Qwen2.5-Math-7B-Instruct",
        displayName: "Qwen 2.5 Math 7B Instruct",
        description: "Advanced math reasoning model (7B parameters)",
        type: "Math Reasoning",
        updated: "2024-09-19",
        downloads: "1.2M",
        likes: "2.4k",
        size: "4.4GB",
        tags: ["math", "reasoning", "advanced", "specialized"]
      },
      {
        name: "qwen/Qwen2.5-Math-72B-Instruct",
        displayName: "Qwen 2.5 Math 72B Instruct",
        description: "State-of-the-art math reasoning model",
        type: "Math Reasoning",
        updated: "2024-09-19",
        downloads: "650k",
        likes: "1.9k",
        size: "41GB",
        tags: ["math", "reasoning", "state-of-the-art", "specialized"]
      },
      // Qwen Coder Series
      {
        name: "qwen/Qwen2.5-Coder-1.5B",
        displayName: "Qwen 2.5 Coder 1.5B",
        description: "Lightweight coding model (1.5B parameters)",
        type: "Code Generation",
        updated: "2024-11-12",
        downloads: "1.1M",
        likes: "2.3k",
        size: "0.9GB",
        tags: ["code-generation", "programming", "lightweight"]
      },
      {
        name: "qwen/Qwen2.5-Coder-7B",
        displayName: "Qwen 2.5 Coder 7B",
        description: "Efficient coding model with strong performance",
        type: "Code Generation",
        updated: "2024-11-12",
        downloads: "1.5M",
        likes: "3.1k",
        size: "4.4GB",
        tags: ["code-generation", "programming", "efficient"]
      },
      {
        name: "qwen/Qwen2.5-Coder-14B",
        displayName: "Qwen 2.5 Coder 14B",
        description: "Advanced coding model for complex programming tasks",
        type: "Code Generation",
        updated: "2024-11-12",
        downloads: "1.2M",
        likes: "2.8k",
        size: "8.4GB",
        tags: ["code-generation", "programming", "advanced"]
      },
      {
        name: "qwen/Qwen2.5-Coder-32B",
        displayName: "Qwen 2.5 Coder 32B",
        description: "Specialized coding model with 32B parameters",
        type: "Code Generation",
        updated: "2024-11-12",
        downloads: "890k",
        likes: "2.1k",
        size: "19GB",
        tags: ["code-generation", "programming", "multilingual"]
      },
      // Qwen3 Series (Latest)
      {
        name: "qwen/Qwen3-8B",
        displayName: "Qwen 3 8B",
        description: "Latest generation Qwen model (8B parameters)",
        type: "Text Generation",
        updated: "2025-01-15",
        downloads: "1.8M",
        likes: "3.4k",
        size: "4.7GB",
        tags: ["text-generation", "latest", "multilingual", "efficient"]
      },
      {
        name: "qwen/Qwen3-32B",
        displayName: "Qwen 3 32B",
        description: "Advanced Qwen 3 model with enhanced capabilities",
        type: "Text Generation",
        updated: "2025-01-15",
        downloads: "890k",
        likes: "2.1k",
        size: "19GB",
        tags: ["text-generation", "latest", "advanced", "multilingual"]
      }
    ]
  },
  "mistral": {
    name: "Mistral",
    description: "Mistral AI's efficient and powerful language models",
    category: "efficient",
    models: [
      // Mistral 7B Series
      {
        name: "mistralai/Mistral-7B-v0.1",
        displayName: "Mistral 7B v0.1",
        description: "Original efficient 7B model",
        type: "Text Generation",
        updated: "2023-09-27",
        downloads: "5.8M",
        likes: "9.2k",
        size: "4.1GB",
        tags: ["text-generation", "efficient", "original"]
      },
      {
        name: "mistralai/Mistral-7B-v0.3",
        displayName: "Mistral 7B v0.3",
        description: "Latest version of the efficient 7B model",
        type: "Text Generation",
        updated: "2024-05-22",
        downloads: "4.2M",
        likes: "7.3k",
        size: "4.1GB",
        tags: ["text-generation", "efficient", "general"]
      },
      {
        name: "mistralai/Mistral-7B-Instruct-v0.1",
        displayName: "Mistral 7B Instruct v0.1",
        description: "Original instruction-tuned 7B model",
        type: "Chat",
        updated: "2023-09-27",
        downloads: "7.1M",
        likes: "10.5k",
        size: "4.1GB",
        tags: ["chat", "instruct", "efficient"]
      },
      {
        name: "mistralai/Mistral-7B-Instruct-v0.2",
        displayName: "Mistral 7B Instruct v0.2",
        description: "Improved instruction-tuned version",
        type: "Chat",
        updated: "2023-12-11",
        downloads: "8.3M",
        likes: "11.2k",
        size: "4.1GB",
        tags: ["chat", "instruct", "improved"]
      },
      {
        name: "mistralai/Mistral-7B-Instruct-v0.3",
        displayName: "Mistral 7B Instruct v0.3",
        description: "Latest instruction-tuned version with enhanced chat capabilities",
        type: "Chat",
        updated: "2024-05-22",
        downloads: "6.8M",
        likes: "9.1k",
        size: "4.1GB",
        tags: ["chat", "instruct", "efficient", "latest"]
      },
      // Mistral Small
      {
        name: "mistralai/Mistral-Small-2409",
        displayName: "Mistral Small 2409",
        description: "Compact model optimized for efficiency (22B parameters)",
        type: "Text Generation",
        updated: "2024-09-18",
        downloads: "1.8M",
        likes: "3.4k",
        size: "13GB",
        tags: ["compact", "efficient", "latest"]
      },
      {
        name: "mistralai/Mistral-Small-Instruct-2409",
        displayName: "Mistral Small Instruct 2409",
        description: "Instruction-tuned compact model",
        type: "Chat",
        updated: "2024-09-18",
        downloads: "2.1M",
        likes: "4.1k",
        size: "13GB",
        tags: ["compact", "instruct", "efficient"]
      },
      // Mixtral Series
      {
        name: "mistralai/Mixtral-8x7B-v0.1",
        displayName: "Mixtral 8x7B",
        description: "Mixture of experts model with 8x7B architecture",
        type: "Text Generation",
        updated: "2023-12-11",
        downloads: "2.9M",
        likes: "5.4k",
        size: "26GB",
        tags: ["mixture-of-experts", "efficient", "multilingual"]
      },
      {
        name: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        displayName: "Mixtral 8x7B Instruct",
        description: "Instruction-tuned Mixtral 8x7B model",
        type: "Chat",
        updated: "2023-12-11",
        downloads: "3.4M",
        likes: "6.2k",
        size: "26GB",
        tags: ["mixture-of-experts", "instruct", "multilingual"]
      },
      {
        name: "mistralai/Mixtral-8x22B-v0.1",
        displayName: "Mixtral 8x22B",
        description: "Larger mixture of experts with 8x22B parameters",
        type: "Text Generation",
        updated: "2024-04-17",
        downloads: "1.1M",
        likes: "2.8k",
        size: "87GB",
        tags: ["mixture-of-experts", "large", "multilingual"]
      },
      {
        name: "mistralai/Mixtral-8x22B-Instruct-v0.1",
        displayName: "Mixtral 8x22B Instruct",
        description: "Instruction-tuned large Mixtral model",
        type: "Chat",
        updated: "2024-04-17",
        downloads: "1.3M",
        likes: "3.1k",
        size: "87GB",
        tags: ["mixture-of-experts", "large", "instruct"]
      },
      // Codestral
      {
        name: "mistralai/Codestral-22B-v0.1",
        displayName: "Codestral 22B",
        description: "Specialized code generation model",
        type: "Code Generation",
        updated: "2024-05-29",
        downloads: "1.5M",
        likes: "3.8k",
        size: "13GB",
        tags: ["code-generation", "programming", "specialized"]
      },
      // Mistral Nemo
      {
        name: "mistralai/Mistral-Nemo-Base-2407",
        displayName: "Mistral Nemo Base",
        description: "12B parameter model with enhanced capabilities",
        type: "Text Generation",
        updated: "2024-07-24",
        downloads: "1.2M",
        likes: "2.9k",
        size: "7.2GB",
        tags: ["12b", "enhanced", "base-model"]
      },
      {
        name: "mistralai/Mistral-Nemo-Instruct-2407",
        displayName: "Mistral Nemo Instruct",
        description: "Instruction-tuned 12B model",
        type: "Chat",
        updated: "2024-07-24",
        downloads: "1.6M",
        likes: "3.5k",
        size: "7.2GB",
        tags: ["12b", "instruct", "enhanced"]
      }
    ]
  },
  "gemma": {
    name: "Gemma",
    description: "Google's Gemma family of lightweight open models",
    category: "lightweight",
    models: [
      // Gemma 1 Series
      {
        name: "gemma:2b",
        displayName: "Gemma 2B",
        description: "Ultra-lightweight 2B model for edge deployment",
        type: "Text Generation",
        updated: "2024-02-21",
        downloads: "2.8M",
        likes: "5.9k",
        size: "1.4GB",
        tags: ["lightweight", "edge", "efficient", "google"]
      },
      {
        name: "gemma:2b-instruct",
        displayName: "Gemma 2B IT",
        description: "Lightweight 2B model for efficient inference",
        type: "Chat",
        updated: "2024-02-21",
        downloads: "3.1M",
        likes: "6.8k",
        size: "1.4GB",
        tags: ["lightweight", "efficient", "instruct", "google"]
      },
      {
        name: "gemma:7b",
        displayName: "Gemma 7B",
        description: "Base 7B model for general text generation",
        type: "Text Generation",
        updated: "2024-02-21",
        downloads: "3.8M",
        likes: "7.3k",
        size: "4.2GB",
        tags: ["balanced", "general", "base-model", "google"]
      },
      {
        name: "gemma:7b-instruct",
        displayName: "Gemma 7B IT",
        description: "Balanced 7B model for general tasks",
        type: "Chat",
        updated: "2024-02-21",
        downloads: "4.2M",
        likes: "8.1k",
        size: "4.2GB",
        tags: ["balanced", "general", "instruct", "google"]
      },
      // Gemma 2 Series (Latest)
      {
        name: "gemma2:2b",
        displayName: "Gemma 2 2B",
        description: "Enhanced 2B model with improved capabilities",
        type: "Text Generation",
        updated: "2024-06-27",
        downloads: "1.9M",
        likes: "3.8k",
        size: "1.4GB",
        tags: ["lightweight", "enhanced", "efficient", "latest"]
      },
      {
        name: "gemma2:2b-instruct",
        displayName: "Gemma 2 2B IT",
        description: "Instruction-tuned enhanced 2B model",
        type: "Chat",
        updated: "2024-06-27",
        downloads: "2.4M",
        likes: "4.6k",
        size: "1.4GB",
        tags: ["lightweight", "enhanced", "instruct", "latest"]
      },
      {
        name: "gemma2:9b",
        displayName: "Gemma 2 9B",
        description: "9 billion parameter model from Gemma 2 series",
        type: "Text Generation",
        updated: "2024-06-27",
        downloads: "1.8M",
        likes: "3.1k",
        size: "5.4GB",
        tags: ["text-generation", "lightweight", "efficient"]
      },
      {
        name: "gemma2:9b-instruct",
        displayName: "Gemma 2 9B IT",
        description: "Instruction-tuned version for chat and assistance",
        type: "Chat",
        updated: "2024-06-27",
        downloads: "2.3M",
        likes: "4.2k",
        size: "5.4GB",
        tags: ["chat", "instruct", "assistant", "lightweight"]
      },
      {
        name: "gemma2:27b",
        displayName: "Gemma 2 27B",
        description: "27 billion parameter model with enhanced performance",
        type: "Text Generation",
        updated: "2024-06-27",
        downloads: "950k",
        likes: "1.9k",
        size: "16GB",
        tags: ["text-generation", "performance", "google"]
      },
      {
        name: "gemma2:27b-instruct",
        displayName: "Gemma 2 27B IT",
        description: "Instruction-tuned large model for complex tasks",
        type: "Chat",
        updated: "2024-06-27",
        downloads: "1.1M",
        likes: "2.8k",
        size: "16GB",
        tags: ["large", "instruct", "complex-tasks", "latest"]
      },
      // Code Gemma
      {
        name: "codegemma:2b",
        displayName: "CodeGemma 2B",
        description: "Lightweight code generation model",
        type: "Code Generation",
        updated: "2024-04-09",
        downloads: "1.3M",
        likes: "2.9k",
        size: "1.4GB",
        tags: ["code-generation", "lightweight", "programming"]
      },
      {
        name: "codegemma:7b",
        displayName: "CodeGemma 7B",
        description: "Advanced code generation model",
        type: "Code Generation",
        updated: "2024-04-09",
        downloads: "1.8M",
        likes: "3.6k",
        size: "4.2GB",
        tags: ["code-generation", "advanced", "programming"]
      },
      {
        name: "codegemma:7b-instruct",
        displayName: "CodeGemma 7B IT",
        description: "Instruction-tuned code generation model",
        type: "Code Generation",
        updated: "2024-04-09",
        downloads: "2.1M",
        likes: "4.1k",
        size: "4.2GB",
        tags: ["code-generation", "instruct", "programming"]
      }
    ]
  },
  "phi": {
    name: "Phi",
    description: "Microsoft's Phi series of small language models",
    category: "small",
    models: [
      // Phi-2 Series
      {
        name: "phi:2.7b",
        displayName: "Phi-2",
        description: "2.7B parameter model with strong reasoning capabilities",
        type: "Text Generation",
        updated: "2023-12-12",
        downloads: "3.1M",
        likes: "5.8k",
        size: "1.6GB",
        tags: ["small", "reasoning", "efficient", "microsoft"]
      },
      // Phi-3 Series
      {
        name: "phi3:3.8b-mini-4k-instruct",
        displayName: "Phi-3 Mini 4K",
        description: "Compact 3.8B model optimized for efficiency",
        type: "Chat",
        updated: "2024-04-23",
        downloads: "1.2M",
        likes: "2.8k",
        size: "2.3GB",
        tags: ["small", "efficient", "instruct", "mobile"]
      },
      {
        name: "phi3:3.8b-mini-128k-instruct",
        displayName: "Phi-3 Mini 128K",
        description: "3.8B model with extended 128K context length",
        type: "Chat",
        updated: "2024-04-23",
        downloads: "890k",
        likes: "2.1k",
        size: "2.3GB",
        tags: ["small", "efficient", "instruct", "long-context"]
      },
      {
        name: "phi3:14b-medium-4k-instruct",
        displayName: "Phi-3 Small 8K",
        description: "7B parameter model with 8K context length",
        type: "Chat",
        updated: "2024-05-21",
        downloads: "780k",
        likes: "1.9k",
        size: "4.2GB",
        tags: ["small", "efficient", "instruct", "long-context"]
      },
      {
        name: "phi3:14b-medium-128k-instruct",
        displayName: "Phi-3 Small 128K",
        description: "7B model with extended 128K context length",
        type: "Chat",
        updated: "2024-05-21",
        downloads: "650k",
        likes: "1.6k",
        size: "4.2GB",
        tags: ["small", "efficient", "instruct", "long-context"]
      },
      {
        name: "phi3:14b-medium-4k-instruct",
        displayName: "Phi-3 Medium 4K",
        description: "14B parameter model with balanced performance",
        type: "Chat",
        updated: "2024-05-21",
        downloads: "560k",
        likes: "1.4k",
        size: "8.4GB",
        tags: ["medium", "instruct", "balanced"]
      },
      {
        name: "phi3:14b-medium-14k-instruct",
        displayName: "Phi-3 Medium 14K",
        description: "14B parameter model with extended context",
        type: "Chat",
        updated: "2024-05-21",
        downloads: "520k",
        likes: "1.3k",
        size: "8.4GB",
        tags: ["medium", "instruct", "long-context"]
      },
      {
        name: "phi3:14b-medium-128k-instruct",
        displayName: "Phi-3 Medium 128K",
        description: "14B model with maximum 128K context length",
        type: "Chat",
        updated: "2024-05-21",
        downloads: "480k",
        likes: "1.2k",
        size: "8.4GB",
        tags: ["medium", "instruct", "long-context"]
      },
      // Phi-3.5 Series
      {
        name: "phi3.5:3.8b",
        displayName: "Phi-3.5 Mini",
        description: "Enhanced 3.8B model with improved capabilities",
        type: "Chat",
        updated: "2024-08-20",
        downloads: "1.8M",
        likes: "3.4k",
        size: "2.3GB",
        tags: ["small", "enhanced", "instruct", "latest"]
      },
      {
        name: "phi3.5:moe",
        displayName: "Phi-3.5 MoE",
        description: "Mixture-of-Experts model with 42B total parameters",
        type: "Chat",
        updated: "2024-08-20",
        downloads: "720k",
        likes: "1.8k",
        size: "24GB",
        tags: ["moe", "instruct", "advanced", "efficient"]
      },
      // Phi-4 Series (Latest)
      {
        name: "phi4:14b",
        displayName: "Phi-4",
        description: "Latest 14B model with state-of-the-art performance",
        type: "Chat",
        updated: "2024-12-11",
        downloads: "2.1M",
        likes: "4.8k",
        size: "8.4GB",
        tags: ["latest", "advanced", "reasoning", "math"]
      }
    ]
  },
  "claude": {
    name: "Claude",
    description: "Anthropic's Claude family (via third-party implementations)",
    category: "safety",
    models: [
      {
        name: "claude:3-haiku",
        displayName: "Claude 3 Haiku",
        description: "Fast and efficient model for simple tasks",
        type: "Chat",
        updated: "2024-03-04",
        downloads: "640k",
        likes: "1.8k",
        size: "Unknown",
        tags: ["fast", "efficient", "safety", "anthropic"]
      },
      {
        name: "claude:3-sonnet",
        displayName: "Claude 3 Sonnet",
        description: "Balanced model for complex reasoning",
        type: "Chat",
        updated: "2024-03-04",
        downloads: "890k",
        likes: "2.5k",
        size: "Unknown",
        tags: ["reasoning", "balanced", "safety", "anthropic"]
      }
    ]
  },
  "tinyllama": {
    name: "TinyLlama",
    description: "Ultra-compact models for resource-constrained environments",
    category: "lightweight",
    models: [
      {
        name: "tinyllama:1.1b",
        displayName: "TinyLlama 1.1B Chat",
        description: "Ultra-compact chat model (1.1B parameters)",
        type: "Chat",
        updated: "2024-01-04",
        downloads: "2.8M",
        likes: "5.1k",
        size: "0.7GB",
        tags: ["tiny", "chat", "efficient", "mobile"]
      },
      {
        name: "tinyllama:1.1b-intermediate",
        displayName: "TinyLlama 1.1B Intermediate",
        description: "Intermediate checkpoint of TinyLlama training",
        type: "Text Generation",
        updated: "2024-01-04",
        downloads: "1.9M",
        likes: "3.4k",
        size: "0.7GB",
        tags: ["tiny", "checkpoint", "efficient"]
      }
    ]
  },
  "stablelm": {
    name: "StableLM",
    description: "Stability AI's language models",
    category: "general",
    models: [
      {
        name: "stablelm2:1.6b",
        displayName: "StableLM 3B",
        description: "Compact 3B model for general tasks",
        type: "Text Generation",
        updated: "2023-04-19",
        downloads: "1.2M",
        likes: "2.8k",
        size: "1.8GB",
        tags: ["compact", "general", "stability"]
      },
      {
        name: "stablelm2:12b",
        displayName: "StableLM 7B SFT",
        description: "Supervised fine-tuned 7B model",
        type: "Chat",
        updated: "2023-07-12",
        downloads: "890k",
        likes: "2.1k",
        size: "4.2GB",
        tags: ["sft", "chat", "stability"]
      },
      {
        name: "stablelm-zephyr:3b",
        displayName: "StableLM 2 1.6B",
        description: "Small efficient model (1.6B parameters)",
        type: "Text Generation",
        updated: "2024-01-19",
        downloads: "1.5M",
        likes: "3.2k",
        size: "1.0GB",
        tags: ["small", "efficient", "stability"]
      },
      {
        name: "stablelm2:12b",
        displayName: "StableLM 2 12B",
        description: "Advanced 12B model with strong performance",
        type: "Text Generation",
        updated: "2024-01-19",
        downloads: "720k",
        likes: "1.8k",
        size: "7.2GB",
        tags: ["advanced", "performance", "stability"]
      }
    ]
  },
  "yi": {
    name: "Yi",
    description: "01.AI's Yi series of models",
    category: "multilingual",
    models: [
      {
        name: "yi:6b",
        displayName: "Yi 1.5 6B",
        description: "Efficient 6B model with strong capabilities",
        type: "Text Generation",
        updated: "2024-05-13",
        downloads: "1.1M",
        likes: "2.4k",
        size: "3.6GB",
        tags: ["efficient", "multilingual", "6b"]
      },
      {
        name: "yi:6b-chat",
        displayName: "Yi 1.5 6B Chat",
        description: "Chat-optimized 6B model",
        type: "Chat",
        updated: "2024-05-13",
        downloads: "1.3M",
        likes: "2.8k",
        size: "3.6GB",
        tags: ["chat", "multilingual", "efficient"]
      },
      {
        name: "yi:9b",
        displayName: "Yi 1.5 9B",
        description: "Advanced 9B model with enhanced performance",
        type: "Text Generation",
        updated: "2024-05-13",
        downloads: "890k",
        likes: "2.1k",
        size: "5.4GB",
        tags: ["advanced", "multilingual", "9b"]
      },
      {
        name: "yi:9b-chat",
        displayName: "Yi 1.5 9B Chat",
        description: "Chat-optimized 9B model",
        type: "Chat",
        updated: "2024-05-13",
        downloads: "1.1M",
        likes: "2.6k",
        size: "5.4GB",
        tags: ["chat", "multilingual", "advanced"]
      }
    ]
  },
  "specialized": {
    name: "Specialized Models",
    description: "Models designed for specific tasks and domains",
    category: "specialized",
    models: [
      {
        name: "starcoder2:3b",
        displayName: "StarCoder2 3B",
        description: "Compact code generation model",
        type: "Code Generation",
        updated: "2024-02-28",
        downloads: "1.8M",
        likes: "3.4k",
        size: "1.8GB",
        tags: ["code-generation", "programming", "compact"]
      },
      {
        name: "starcoder2:7b",
        displayName: "StarCoder2 7B",
        description: "Advanced code generation model",
        type: "Code Generation",
        updated: "2024-02-28",
        downloads: "1.5M",
        likes: "3.1k",
        size: "4.2GB",
        tags: ["code-generation", "programming", "advanced"]
      },
      {
        name: "starcoder2:15b",
        displayName: "StarCoder2 15B",
        description: "Large-scale code generation model",
        type: "Code Generation",
        updated: "2024-02-28",
        downloads: "1.1M",
        likes: "2.7k",
        size: "8.9GB",
        tags: ["code-generation", "programming", "large"]
      },
      {
        name: "nous-hermes2:10.7b",
        displayName: "Nous Hermes 2 10.7B",
        description: "Fine-tuned model with enhanced reasoning capabilities",
        type: "Chat",
        updated: "2024-01-15",
        downloads: "1.2M",
        likes: "2.8k",
        size: "6.4GB",
        tags: ["chat", "reasoning", "fine-tuned"]
      },
      {
        name: "neural-chat:7b-v3.3",
        displayName: "Neural Chat 7B",
        description: "Optimized chat model for conversations",
        type: "Chat",
        updated: "2024-02-10",
        downloads: "980k",
        likes: "2.3k",
        size: "4.1GB",
        tags: ["chat", "conversation", "optimized"]
      },
      {
        name: "wizardlm2:7b",
        displayName: "WizardLM 2 7B",
        description: "Advanced reasoning and instruction-following model",
        type: "Chat",
        updated: "2024-04-15",
        downloads: "720k",
        likes: "1.8k",
        size: "4.0GB",
        tags: ["reasoning", "instruction", "advanced"]
      }
    ]
  }
};

// Helper functions for working with model data
export const getModelSeriesList = () => {
  return Object.keys(modelSeries).map(key => ({
    id: key,
    ...modelSeries[key]
  }));
};

export const getModelsBySeries = (seriesId) => {
  return modelSeries[seriesId]?.models || [];
};

export const searchModels = (query) => {
  const results = [];
  const lowerQuery = query.toLowerCase();
  
  Object.values(modelSeries).forEach(series => {
    series.models.forEach(model => {
      if (
        model.name.toLowerCase().includes(lowerQuery) ||
        model.displayName.toLowerCase().includes(lowerQuery) ||
        model.description.toLowerCase().includes(lowerQuery) ||
        model.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push({
          ...model,
          seriesName: series.name
        });
      }
    });
  });
  
  return results;
};

export const getModelByName = (modelName) => {
  for (const series of Object.values(modelSeries)) {
    const model = series.models.find(m => m.name === modelName);
    if (model) {
      return {
        ...model,
        seriesName: series.name
      };
    }
  }
  return null;
};

export const getPopularModels = (limit = 10) => {
  const allModels = [];
  
  Object.values(modelSeries).forEach(series => {
    series.models.forEach(model => {
      allModels.push({
        ...model,
        seriesName: series.name,
        popularityScore: parseFloat(model.downloads.replace(/[^\d.]/g, ''))
      });
    });
  });
  
  return allModels
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, limit);
};

export const getModelsByCategory = (category) => {
  return Object.values(modelSeries)
    .filter(series => series.category === category)
    .flatMap(series => 
      series.models.map(model => ({
        ...model,
        seriesName: series.name
      }))
    );
}; 