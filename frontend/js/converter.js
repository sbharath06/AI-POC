class ConverterController {
    constructor(authManager, app) {
        this.auth = authManager;
        this.app = app;
        this.modal = document.getElementById('convert-modal');
        this.dropZone = document.getElementById('convert-drop-zone');
        this.fileInput = document.getElementById('convert-file-input');
        this.closeBtn = document.getElementById('close-convert-btn');
        this.optionsDiv = document.getElementById('convert-options');
        this.resultDiv = document.getElementById('convert-result');
        this.progressDiv = document.getElementById('convert-progress');
        this.filenameSpan = document.getElementById('convert-filename');
        this.formatSelect = document.getElementById('output-format');
        this.convertBtn = document.getElementById('convert-btn');
        this.progressBar = document.getElementById('convert-progress-bar');
        this.statusText = document.getElementById('convert-status-text');
        this.summaryDiv = document.getElementById('convert-summary');
        this.downloadLink = document.getElementById('convert-download-link');
        
        this.selectedFile = null;
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.closeBtn.addEventListener('click', () => this.hideModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hideModal();
        });
        
        // Drag & drop
        this.dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); this.dropZone.classList.add('dragover'); });
        this.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropZone.classList.add('dragover'); });
        this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('dragover'));
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.selectFile(e.dataTransfer.files[0]);
        });
        
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.selectFile(e.target.files[0]);
        });
        
        this.convertBtn.addEventListener('click', () => this.convert());
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
        this.optionsDiv.classList.add('hidden');
        this.resultDiv.classList.add('hidden');
        this.progressDiv.classList.add('hidden');
        this.progressBar.style.width = '0%';
        this.fileInput.value = '';
        this.selectedFile = null;
    }
    
    selectFile(file) {
        const validExtensions = ['.pdf', '.docx', '.txt', '.xlsx', '.md', '.csv'];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!validExtensions.includes(ext)) {
            this.app.showToast('Unsupported file format', 'error');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            this.app.showToast('File size exceeds 20MB', 'error');
            return;
        }
        
        this.selectedFile = file;
        this.filenameSpan.textContent = file.name;
        this.dropZone.classList.add('hidden');
        this.optionsDiv.classList.remove('hidden');
        
        // Update format options based on input type
        this.updateFormatOptions(ext);
    }
    
    updateFormatOptions(inputExt) {
        const select = this.formatSelect;
        select.innerHTML = '';
        
        const allFormats = {
            '.pdf': ['docx', 'txt'],
            '.docx': ['pdf', 'txt'],
            '.txt': ['pdf'],
            '.md': ['pdf'],
            '.xlsx': ['pdf', 'csv'],
            '.csv': ['pdf']
        };
        
        const formats = allFormats[inputExt] || ['pdf'];
        const labels = { pdf: 'PDF', docx: 'Word (DOCX)', txt: 'Plain Text', csv: 'CSV' };
        
        formats.forEach(fmt => {
            const opt = document.createElement('option');
            opt.value = fmt;
            opt.textContent = labels[fmt] || fmt.toUpperCase();
            select.appendChild(opt);
        });
    }
    
    async convert() {
        if (!this.selectedFile) return;
        
        this.optionsDiv.classList.add('hidden');
        this.progressDiv.classList.remove('hidden');
        this.statusText.textContent = 'Converting...';
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 3;
            if (progress > 85) clearInterval(interval);
            this.progressBar.style.width = `${progress}%`;
        }, 100);
        
        try {
            const formData = new FormData();
            formData.append('file', this.selectedFile);
            
            const token = this.auth.getToken();
            const outputFormat = this.formatSelect.value;
            
            const response = await fetch(`${this.auth.baseUrl}/api/convert?output_format=${outputFormat}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            clearInterval(interval);
            this.progressBar.style.width = '100%';
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Conversion failed');
            }
            
            const result = await response.json();
            
            this.progressDiv.classList.add('hidden');
            this.resultDiv.classList.remove('hidden');
            
            if (result.summary) {
                this.summaryDiv.textContent = result.summary;
                this.summaryDiv.classList.remove('hidden');
            }
            
            this.downloadLink.href = `${this.auth.baseUrl}${result.download_url}`;
            this.downloadLink.setAttribute('download', result.filename);
            // Need to add auth header for download - use a workaround
            this.downloadLink.addEventListener('click', async (e) => {
                e.preventDefault();
                const res = await fetch(`${this.auth.baseUrl}${result.download_url}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                a.click();
                URL.revokeObjectURL(url);
            }, { once: true });
            
            this.app.showToast('File converted successfully!', 'success');
            
        } catch (error) {
            clearInterval(interval);
            this.progressDiv.classList.add('hidden');
            this.optionsDiv.classList.remove('hidden');
            this.app.showToast(error.message || 'Conversion failed', 'error');
        }
    }
}
