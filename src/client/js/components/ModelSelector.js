// Model Selector Component - Organized by series
import { modelSeries, getModelSeriesList, getModelsBySeries, searchModels } from '../data/modelSeries.js';

export class ModelSelector {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            allowMultiple: false,
            showSearch: true,
            showCategories: true,
            onSelectionChange: null,
            selectedModels: [],
            ...options
        };
        
        this.selectedModels = new Set(this.options.selectedModels);
        this.searchQuery = '';
        this.selectedCategory = '';
        this.expandedSeries = new Set();
        
        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        const seriesList = getModelSeriesList();
        
        this.container.innerHTML = `
            <div class="model-selector">
                ${this.options.showSearch ? this.renderSearchSection() : ''}
                ${this.options.showCategories ? this.renderCategoryFilter(seriesList) : ''}
                <div class="model-series-container">
                    ${this.renderModelSeries(seriesList)}
                </div>
                ${this.selectedModels.size > 0 ? this.renderSelectedModels() : ''}
            </div>
        `;
    }

    renderSearchSection() {
        return `
            <div class="search-section">
                <div class="search-input-container">
                    <i class="fas fa-search"></i>
                    <input 
                        type="text" 
                        class="search-input" 
                        placeholder="Search models by name, description, or tags..."
                        value="${this.searchQuery}"
                    >
                    ${this.searchQuery ? '<button class="clear-search"><i class="fas fa-times"></i></button>' : ''}
                </div>
            </div>
        `;
    }

    renderCategoryFilter(seriesList) {
        const categories = [...new Set(seriesList.map(s => s.category))];
        
        return `
            <div class="category-filter">
                <div class="category-tabs">
                    <button class="category-tab ${!this.selectedCategory ? 'active' : ''}" data-category="">
                        All
                    </button>
                    ${categories.map(category => `
                        <button class="category-tab ${this.selectedCategory === category ? 'active' : ''}" data-category="${category}">
                            ${this.getCategoryDisplayName(category)}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderModelSeries(seriesList) {
        if (this.searchQuery) {
            return this.renderSearchResults();
        }

        const filteredSeries = this.selectedCategory 
            ? seriesList.filter(s => s.category === this.selectedCategory)
            : seriesList;

        return filteredSeries.map(series => {
            const isExpanded = this.expandedSeries.has(series.id);
            const models = getModelsBySeries(series.id);
            
            return `
                <div class="model-series" data-series="${series.id}">
                    <div class="series-header ${isExpanded ? 'expanded' : ''}" data-series="${series.id}">
                        <div class="series-info">
                            <div class="series-name">
                                <i class="fas fa-chevron-right series-chevron"></i>
                                ${series.name}
                                <span class="model-count">(${models.length} models)</span>
                            </div>
                            <div class="series-description">${series.description}</div>
                        </div>
                        <div class="series-category">
                            <span class="category-badge category-${series.category}">
                                ${this.getCategoryDisplayName(series.category)}
                            </span>
                        </div>
                    </div>
                    <div class="series-models ${isExpanded ? 'expanded' : ''}">
                        ${this.renderModels(models, series.name)}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSearchResults() {
        const results = searchModels(this.searchQuery);
        
        if (results.length === 0) {
            return `
                <div class="search-no-results">
                    <i class="fas fa-search"></i>
                    <h3>No models found</h3>
                    <p>Try adjusting your search terms or browse by category</p>
                </div>
            `;
        }

        return `
            <div class="search-results">
                <div class="search-results-header">
                    <h3>Search Results (${results.length})</h3>
                </div>
                <div class="search-results-list">
                    ${this.renderModels(results)}
                </div>
            </div>
        `;
    }

    renderModels(models, seriesName = '') {
        return models.map(model => {
            const isSelected = this.selectedModels.has(model.name);
            
            return `
                <div class="model-item ${isSelected ? 'selected' : ''}" data-model="${model.name}">
                    <div class="model-selection">
                        ${this.options.allowMultiple 
                            ? `<input type="checkbox" ${isSelected ? 'checked' : ''} data-model="${model.name}">`
                            : `<input type="radio" name="model-selection" ${isSelected ? 'checked' : ''} data-model="${model.name}">`
                        }
                    </div>
                    <div class="model-info">
                        <div class="model-header">
                            <div class="model-name">${model.displayName}</div>
                            <div class="model-meta">
                                <span class="model-type">${model.type}</span>
                                <span class="model-size">${model.size}</span>
                            </div>
                        </div>
                        <div class="model-description">${model.description}</div>
                        ${model.paper ? `
                            <div class="model-paper">
                                <i class="fas fa-file-alt"></i>
                                <a href="https://arxiv.org/abs/${model.paper.arxiv}" target="_blank">
                                    ${model.paper.title}
                                </a>
                                <span class="citations">${model.paper.citations} citations</span>
                            </div>
                        ` : ''}
                        <div class="model-stats">
                            <span class="downloads">
                                <i class="fas fa-download"></i>
                                ${model.downloads} downloads
                            </span>
                            <span class="likes">
                                <i class="fas fa-heart"></i>
                                ${model.likes} likes
                            </span>
                            <span class="updated">
                                <i class="fas fa-clock"></i>
                                Updated ${this.formatDate(model.updated)}
                            </span>
                            ${seriesName ? `<span class="series"><i class="fas fa-tag"></i>${seriesName}</span>` : ''}
                        </div>
                        <div class="model-tags">
                            ${model.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    <div class="model-actions">
                        <button class="btn btn-primary btn-sm select-model" data-model="${model.name}">
                            ${isSelected ? 'Selected' : 'Select'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSelectedModels() {
        const selectedModelsList = Array.from(this.selectedModels);
        
        return `
            <div class="selected-models">
                <div class="selected-header">
                    <h4>Selected Models (${selectedModelsList.length})</h4>
                    <button class="btn btn-secondary btn-sm clear-all">Clear All</button>
                </div>
                <div class="selected-list">
                    ${selectedModelsList.map(modelName => {
                        const model = this.getModelByName(modelName);
                        return model ? `
                            <div class="selected-item" data-model="${modelName}">
                                <span class="selected-name">${model.displayName}</span>
                                <button class="remove-selected" data-model="${modelName}">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        ` : '';
                    }).join('')}
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Search input
        this.container.addEventListener('input', (e) => {
            if (e.target.classList.contains('search-input')) {
                this.searchQuery = e.target.value;
                this.render();
            }
        });

        // Clear search
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.clear-search')) {
                this.searchQuery = '';
                this.render();
            }
        });

        // Category filter
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-tab')) {
                this.selectedCategory = e.target.dataset.category;
                this.render();
            }
        });

        // Series expansion
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('series-header') || e.target.closest('.series-header')) {
                const seriesHeader = e.target.closest('.series-header') || e.target;
                const seriesId = seriesHeader.dataset.series;
                
                if (this.expandedSeries.has(seriesId)) {
                    this.expandedSeries.delete(seriesId);
                } else {
                    this.expandedSeries.add(seriesId);
                }
                this.render();
            }
        });

        // Model selection
        this.container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' || e.target.type === 'radio') {
                const modelName = e.target.dataset.model;
                this.toggleModelSelection(modelName);
            }
        });

        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('select-model')) {
                const modelName = e.target.dataset.model;
                this.toggleModelSelection(modelName);
            }
        });

        // Remove selected models
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-selected') || e.target.closest('.remove-selected')) {
                const button = e.target.closest('.remove-selected') || e.target;
                const modelName = button.dataset.model;
                this.selectedModels.delete(modelName);
                this.handleSelectionChange();
                this.render();
            }
        });

        // Clear all selections
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('clear-all')) {
                this.selectedModels.clear();
                this.handleSelectionChange();
                this.render();
            }
        });
    }

    toggleModelSelection(modelName) {
        if (!this.options.allowMultiple) {
            this.selectedModels.clear();
        }

        if (this.selectedModels.has(modelName)) {
            this.selectedModels.delete(modelName);
        } else {
            this.selectedModels.add(modelName);
        }

        this.handleSelectionChange();
        this.render();
    }

    handleSelectionChange() {
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(Array.from(this.selectedModels));
        }
    }

    getSelectedModels() {
        return Array.from(this.selectedModels);
    }

    setSelectedModels(models) {
        this.selectedModels = new Set(models);
        this.render();
    }

    clearSelection() {
        this.selectedModels.clear();
        this.render();
    }

    getModelByName(modelName) {
        for (const series of Object.values(modelSeries)) {
            const model = series.models.find(m => m.name === modelName);
            if (model) return model;
        }
        return null;
    }

    getCategoryDisplayName(category) {
        const categoryNames = {
            'reasoning': 'Reasoning',
            'general': 'General',
            'multilingual': 'Multilingual',
            'efficient': 'Efficient',
            'lightweight': 'Lightweight',
            'small': 'Small',
            'safety': 'Safety',
            'specialized': 'Specialized'
        };
        return categoryNames[category] || category;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            return `${Math.ceil(diffDays / 7)} weeks ago`;
        } else if (diffDays < 365) {
            return `${Math.ceil(diffDays / 30)} months ago`;
        } else {
            return `${Math.ceil(diffDays / 365)} years ago`;
        }
    }
} 