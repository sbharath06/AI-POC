class UploadController {
    constructor(authManager, app) {
        this.authManager = authManager;
        this.app = app; // Reference to main app for showing toasts, etc.
        this.modal = document.getElementById('upload-modal');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.closeBtn = document.getElementById('close-upload-btn');
        this.progressContainer = document.getElementById('upload-progress-container');
        this.progressBar = document.getElementById('upload-progress');
        this.statusText = document.getElementById('upload-status-text');
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.closeBtn.addEventListener('click', () => this.hideModal());
        
        // Drag & Drop
        this.dropZone.addEventListener('dragenter', (e) => this.handleDragIn(e), false);
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e), false);
        this.dropZone.addEventListener('dragleave', (e) => this.handleDragOut(e), false);
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e), false);
        
        // File Input
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFiles(e.target.files[0]);
            }
        });
        
        // Close modal on outside click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });
    }

    showModal() {
        this.modal.classList.remove('hidden');
        this.resetUI();
    }

    hideModal() {
        this.modal.classList.add('hidden');
    }

    resetUI() {
        this.dropZone.classList.remove('hidden');
        this.progressContainer.classList.add('hidden');
        this.progressBar.style.width = '0%';
        this.fileInput.value = '';
    }

    handleDragIn(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('dragover');
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('dragover');
    }
    
    handleDragOut(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('dragover');
        
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            this.handleFiles(files[0]);
        }
    }

    validateFile(file) {
        const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
        const validExtensions = ['.pdf', '.txt', '.md'];
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        let isValidType = validTypes.includes(file.type);
        if (!isValidType) {
            // Check extension as fallback
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            isValidType = validExtensions.includes(ext);
        }
        
        if (!isValidType) {
            this.app.showToast('Invalid file type. Please upload PDF, TXT, or MD.', 'error');
            return false;
        }
        
        if (file.size > maxSize) {
            this.app.showToast('File size exceeds 10MB limit.', 'error');
            return false;
        }
        
        return true;
    }

    async handleFiles(file) {
        if (!this.validateFile(file)) return;
        
        this.dropZone.classList.add('hidden');
        this.progressContainer.classList.remove('hidden');
        this.statusText.textContent = `Uploading ${file.name}...`;
        
        // Simulate progress for UI purposes (fetch doesn't have good upload progress support)
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            if (progress > 90) clearInterval(interval);
            this.progressBar.style.width = `${progress}%`;
        }, 100);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const token = this.authManager.getToken();
            const response = await fetch(`${this.authManager.baseUrl}/api/documents/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            clearInterval(interval);
            
            if (!response.ok) {
                throw new Error('Upload failed');
            }

            this.progressBar.style.width = '100%';
            this.statusText.textContent = 'Upload complete!';
            
            setTimeout(() => {
                this.hideModal();
                this.app.showToast(`${file.name} uploaded successfully`, 'success');
                this.loadDocuments(); // Refresh list
            }, 1000);

        } catch (error) {
            clearInterval(interval);
            this.statusText.textContent = 'Upload failed.';
            this.progressBar.style.backgroundColor = 'var(--error)';
            this.app.showToast('Failed to upload document', 'error');
            
            setTimeout(() => {
                this.resetUI();
            }, 2000);
        }
    }

    async loadDocuments() {
        try {
            const data = await this.app.apiRequest('/api/documents');
            this.renderDocumentList(data);
        } catch (error) {
            console.error('Failed to load documents:', error);
        }
    }

    async deleteDocument(id, event) {
        event.stopPropagation();
        if (!confirm('Are you sure you want to delete this document?')) return;
        
        try {
            await this.app.apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
            this.app.showToast('Document deleted', 'success');
            this.loadDocuments();
        } catch (error) {
            this.app.showToast('Failed to delete document', 'error');
        }
    }

    renderDocumentList(documents) {
        const list = document.getElementById('document-list');
        list.innerHTML = '';
        
        if (documents.length === 0) {
            list.innerHTML = '<div class="document-item" style="color: var(--text-muted); cursor: default;">No documents uploaded</div>';
            return;
        }

        documents.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'document-item';
            
            let iconClass = 'fa-file-lines';
            if (doc.filename.endsWith('.pdf')) iconClass = 'fa-file-pdf';
            
            item.innerHTML = `
                <i class="fa-regular ${iconClass}"></i>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${doc.filename}</span>
                <button class="delete-doc" title="Delete"><i class="fa-solid fa-trash"></i></button>
            `;
            
            const deleteBtn = item.querySelector('.delete-doc');
            deleteBtn.addEventListener('click', (e) => this.deleteDocument(doc.id, e));
            
            list.appendChild(item);
        });
    }
}
