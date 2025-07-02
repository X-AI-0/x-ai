export class ToastManager {
    constructor() {
        this.container = document.getElementById('toastContainer');
        
        // Create container if it doesn't exist
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
        
        this.toasts = new Map();
        this.defaultDuration = 5000;
    }

    show(message, type = 'info', duration = this.defaultDuration) {
        try {
            // Ensure container exists
            if (!this.container) {
                this.container = document.getElementById('toastContainer');
                if (!this.container) {
                    this.container = document.createElement('div');
                    this.container.id = 'toastContainer';
                    this.container.className = 'toast-container';
                    document.body.appendChild(this.container);
                }
            }

        const toast = this.createToast(message, type, duration);
        this.container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
        } catch (error) {
            console.error('Toast error:', error);
            // Fallback to console log if toast fails
            console.log(`[${type.toUpperCase()}] ${message}`);
            return null;
        }
    }

    createToast(message, type, duration) {
        const toastId = Date.now() + Math.random();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.toastId = toastId;

        const icon = this.getIcon(type);
        const title = this.getTitle(type);

        toast.innerHTML = `
            <div class="toast-header">
                <div class="toast-title">
                    <i class="${icon}"></i>
                    ${title}
                </div>
                <button class="toast-close" onclick="toastManager.remove(this.closest('.toast'))">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="toast-message">${message}</div>
        `;

        this.toasts.set(toastId, toast);
        return toast;
    }

    remove(toast) {
        if (!toast || !toast.parentNode) return;

        toast.style.animation = 'slideOutRight 0.3s ease-in-out';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            
            const toastId = toast.dataset.toastId;
            if (toastId) {
                this.toasts.delete(toastId);
            }
        }, 300);
    }

    removeAll() {
        this.toasts.forEach(toast => {
            this.remove(toast);
        });
    }

    getIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    getTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        return titles[type] || titles.info;
    }

    // Convenience methods
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// Make it globally available for onclick handlers
window.toastManager = new ToastManager(); 