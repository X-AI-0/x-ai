export class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.setupGlobalListeners();
    }

    setupGlobalListeners() {
        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return;
        }

        modal.classList.add('active');
        this.activeModals.add(modalId);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Focus management
        this.trapFocus(modal);
        
        // Trigger custom event
        modal.dispatchEvent(new CustomEvent('modalOpened', { detail: { modalId } }));
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return;
        }

        modal.classList.remove('active');
        this.activeModals.delete(modalId);
        
        // Restore body scroll if no modals are open
        if (this.activeModals.size === 0) {
            document.body.style.overflow = '';
        }
        
        // Trigger custom event
        modal.dispatchEvent(new CustomEvent('modalClosed', { detail: { modalId } }));
    }

    closeTopModal() {
        if (this.activeModals.size > 0) {
            const topModal = Array.from(this.activeModals).pop();
            this.closeModal(topModal);
        }
    }

    closeAllModals() {
        Array.from(this.activeModals).forEach(modalId => {
            this.closeModal(modalId);
        });
    }

    isModalOpen(modalId) {
        return this.activeModals.has(modalId);
    }

    trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // Focus first element
        firstElement.focus();
        
        const handleTabKey = (e) => {
            if (e.key !== 'Tab') return;
            
            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };
        
        modal.addEventListener('keydown', handleTabKey);
        
        // Clean up listener when modal closes
        modal.addEventListener('modalClosed', () => {
            modal.removeEventListener('keydown', handleTabKey);
        }, { once: true });
    }

    // Utility methods for common modal operations
    confirm(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return new Promise((resolve) => {
            const modalId = 'confirmModal';
            let modal = document.getElementById(modalId);
            
            if (!modal) {
                modal = this.createConfirmModal(modalId);
                document.body.appendChild(modal);
            }
            
            // Update content
            modal.querySelector('.modal-title').textContent = title;
            modal.querySelector('.modal-message').textContent = message;
            modal.querySelector('.confirm-btn').textContent = confirmText;
            modal.querySelector('.cancel-btn').textContent = cancelText;
            
            // Set up event listeners
            const confirmBtn = modal.querySelector('.confirm-btn');
            const cancelBtn = modal.querySelector('.cancel-btn');
            
            const handleConfirm = () => {
                this.closeModal(modalId);
                resolve(true);
                cleanup();
            };
            
            const handleCancel = () => {
                this.closeModal(modalId);
                resolve(false);
                cleanup();
            };
            
            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };
            
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            
            this.openModal(modalId);
        });
    }

    createConfirmModal(modalId) {
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Confirm</h2>
                </div>
                <div class="modal-body">
                    <p class="modal-message">Are you sure?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                    <button type="button" class="btn btn-primary confirm-btn">Confirm</button>
                </div>
            </div>
        `;
        return modal;
    }

    alert(title, message, buttonText = 'OK') {
        return new Promise((resolve) => {
            const modalId = 'alertModal';
            let modal = document.getElementById(modalId);
            
            if (!modal) {
                modal = this.createAlertModal(modalId);
                document.body.appendChild(modal);
            }
            
            // Update content
            modal.querySelector('.modal-title').textContent = title;
            modal.querySelector('.modal-message').textContent = message;
            modal.querySelector('.ok-btn').textContent = buttonText;
            
            // Set up event listener
            const okBtn = modal.querySelector('.ok-btn');
            
            const handleOk = () => {
                this.closeModal(modalId);
                resolve();
                okBtn.removeEventListener('click', handleOk);
            };
            
            okBtn.addEventListener('click', handleOk);
            
            this.openModal(modalId);
        });
    }

    createAlertModal(modalId) {
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Alert</h2>
                </div>
                <div class="modal-body">
                    <p class="modal-message">Message</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary ok-btn">OK</button>
                </div>
            </div>
        `;
        return modal;
    }
} 