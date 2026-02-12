import { Scene } from 'phaser';
import { HoroscopeService, HoroscopeRequest } from '../HoroscopeService';
import { EventBus } from '../EventBus';

export class HoroscopeModal {
    private scene: Scene;
    private container: HTMLDivElement;
    private isVisible: boolean = false;
    private processing: boolean = false;
    public onClose?: () => void;

    constructor(scene: Scene) {
        this.scene = scene;
        this.createModal();
    }

    private createModal() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'horoscope-modal';
        this.container.style.position = 'absolute';
        this.container.style.top = '50%';
        this.container.style.left = '50%';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.width = '400px';
        this.container.style.backgroundColor = '#1a1a2e'; // Dark mystical blue
        this.container.style.border = '2px solid #9C27B0'; // Purple border
        this.container.style.borderRadius = '10px';
        this.container.style.padding = '20px';
        this.container.style.color = '#fff';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.zIndex = '1000';
        this.container.style.display = 'none';
        this.container.style.boxShadow = '0 0 20px rgba(156, 39, 176, 0.5)';
        
        // Prevent event propagation to game
        this.container.style.pointerEvents = 'auto';
        this.container.onwheel = (e) => e.stopPropagation();
        this.container.onmousedown = (e) => e.stopPropagation();
        this.container.onmouseup = (e) => e.stopPropagation();
        this.container.onclick = (e) => e.stopPropagation();

        // Header
        const header = document.createElement('h2');
        header.innerText = 'Gieo Quẻ Thầy Đồ';
        header.style.textAlign = 'center';
        header.style.color = '#E1BEE7';
        header.style.marginBottom = '20px';
        header.style.marginTop = '0';
        this.container.appendChild(header);

        // Form Container
        const formContainer = document.createElement('div');
        formContainer.id = 'horoscope-form';

        // Birth Date Input
        const dateGroup = this.createInputGroup('Ngày sinh (DD/MM/YYYY)');
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.style.width = '100%';
        dateInput.style.padding = '8px';
        dateInput.style.marginBottom = '15px';
        dateInput.style.backgroundColor = '#2d2d44';
        dateInput.style.border = '1px solid #4a4a6a';
        dateInput.style.color = '#fff';
        dateInput.style.borderRadius = '4px';
        dateInput.addEventListener('keydown', (e) => e.stopPropagation());
        dateInput.addEventListener('keyup', (e) => e.stopPropagation());
        dateInput.addEventListener('keypress', (e) => e.stopPropagation());
        dateGroup.appendChild(dateInput);
        formContainer.appendChild(dateGroup);

        // Birth Time Input
        const timeGroup = this.createInputGroup('Giờ sinh (0-23)');
        const timeInput = document.createElement('input');
        timeInput.type = 'number';
        timeInput.min = '0';
        timeInput.max = '23';
        timeInput.placeholder = 'Ví dụ: 14';
        timeInput.style.width = '100%';
        timeInput.style.padding = '8px';
        timeInput.style.marginBottom = '15px';
        timeInput.style.backgroundColor = '#2d2d44';
        timeInput.style.border = '1px solid #4a4a6a';
        timeInput.style.color = '#fff';
        timeInput.style.borderRadius = '4px';
        timeInput.addEventListener('keydown', (e) => e.stopPropagation());
        timeInput.addEventListener('keyup', (e) => e.stopPropagation());
        timeInput.addEventListener('keypress', (e) => e.stopPropagation());
        timeGroup.appendChild(timeInput);
        formContainer.appendChild(timeGroup);

        // Topic Select
        const topicGroup = this.createInputGroup('Vấn đề muốn xem');
        const topicSelect = document.createElement('select');
        topicSelect.style.width = '100%';
        topicSelect.style.padding = '8px';
        topicSelect.style.marginBottom = '20px';
        topicSelect.style.backgroundColor = '#2d2d44';
        topicSelect.style.border = '1px solid #4a4a6a';
        topicSelect.style.color = '#fff';
        topicSelect.style.borderRadius = '4px';
        topicSelect.addEventListener('keydown', (e) => e.stopPropagation());
        topicSelect.addEventListener('keyup', (e) => e.stopPropagation());
        topicSelect.addEventListener('keypress', (e) => e.stopPropagation());

        const topics = [
            { value: 'daily', label: 'Tử vi hàng ngày' },
            { value: 'work', label: 'Công danh sự nghiệp' },
            { value: 'love', label: 'Tình duyên' },
            { value: 'wealth', label: 'Tài lộc' },
            { value: 'health', label: 'Sức khỏe' }
        ];

        topics.forEach(t => {
            const option = document.createElement('option');
            option.value = t.value;
            option.text = t.label;
            topicSelect.appendChild(option);
        });
        topicGroup.appendChild(topicSelect);
        formContainer.appendChild(topicGroup);

        // Button Group
        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.justifyContent = 'space-between';
        btnGroup.style.gap = '10px';

        // Close Button
        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'Đóng';
        closeBtn.style.flex = '1';
        closeBtn.style.padding = '10px';
        closeBtn.style.backgroundColor = '#5f5f5f';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '4px';
        closeBtn.style.color = 'white';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => this.hide();

        // Submit Button
        const submitBtn = document.createElement('button');
        submitBtn.innerHTML = 'Xem ngay <span style="color: #FFD700">(-50 Gold)</span>';
        submitBtn.style.flex = '1';
        submitBtn.style.padding = '10px';
        submitBtn.style.backgroundColor = '#9C27B0';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.color = 'white';
        submitBtn.style.fontWeight = 'bold';
        submitBtn.style.cursor = 'pointer';

        submitBtn.onclick = async () => {
            if (this.processing) return;

            const dateVal = dateInput.value; // YYYY-MM-DD
            const timeVal = parseInt(timeInput.value);
            const topicVal = topicSelect.value;

            if (!dateVal || isNaN(timeVal)) {
                alert('Vui lòng nhập đầy đủ ngày giờ sinh!');
                return;
            }

            const [year, month, day] = dateVal.split('-').map(Number);

            const request: HoroscopeRequest = {
                day,
                month,
                year,
                hour: timeVal,
                topic: topicVal
            };

            this.processing = true;
            submitBtn.innerText = 'Đang luận giải...';
            submitBtn.disabled = true;

            try {
                const result = await HoroscopeService.consult(request);
                
                // Show Result
                formContainer.style.display = 'none';
                resultContainer.style.display = 'block';
                resultContent.innerText = result.content;
                
                // Update gold UI if needed (emit event)
                EventBus.emit('currency-updated', { gold: result.remainingGold });

            } catch (error: any) {
                alert(error.message);
            } finally {
                this.processing = false;
                submitBtn.innerHTML = 'Xem ngay <span style="color: #FFD700">(-50 Gold)</span>';
                submitBtn.disabled = false;
            }
        };

        btnGroup.appendChild(closeBtn);
        btnGroup.appendChild(submitBtn);
        formContainer.appendChild(btnGroup);

        this.container.appendChild(formContainer);

        // Result Container (Initially Hidden)
        const resultContainer = document.createElement('div');
        resultContainer.id = 'horoscope-result';
        resultContainer.style.display = 'none';
        resultContainer.style.maxHeight = '300px'; // Fixed max height for scrolling
        resultContainer.style.overflowY = 'auto'; // Enable vertical scrolling
        resultContainer.style.padding = '10px';
        resultContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        resultContainer.style.borderRadius = '5px';
        resultContainer.style.border = '1px solid #4a4a6a';
        resultContainer.style.marginTop = '10px';
        
        // Custom scrollbar styling
        const style = document.createElement('style');
        style.innerHTML = `
            #horoscope-result::-webkit-scrollbar {
                width: 8px;
            }
            #horoscope-result::-webkit-scrollbar-track {
                background: #1a1a2e; 
                border-radius: 4px;
            }
            #horoscope-result::-webkit-scrollbar-thumb {
                background: #9C27B0; 
                border-radius: 4px;
            }
            #horoscope-result::-webkit-scrollbar-thumb:hover {
                background: #BA68C8; 
            }
        `;
        this.container.appendChild(style);

        const resultTitle = document.createElement('h3');
        resultTitle.innerText = 'Lời Luận Giải';
        resultTitle.style.color = '#FFD700';
        resultTitle.style.marginTop = '0';
        resultTitle.style.textAlign = 'center';
        resultContainer.appendChild(resultTitle);

        const resultContent = document.createElement('div'); // Changed to div for better formatting
        resultContent.style.lineHeight = '1.6';
        resultContent.style.textAlign = 'justify';
        resultContent.style.whiteSpace = 'pre-wrap';
        resultContent.style.fontSize = '14px';
        resultContainer.appendChild(resultContent);

        const backBtn = document.createElement('button');
        backBtn.innerText = 'Quay lại';
        backBtn.style.marginTop = '15px';
        backBtn.style.width = '100%';
        backBtn.style.padding = '10px';
        backBtn.style.backgroundColor = '#5f5f5f';
        backBtn.style.border = 'none';
        backBtn.style.borderRadius = '4px';
        backBtn.style.color = 'white';
        backBtn.style.cursor = 'pointer';
        backBtn.onclick = () => {
            resultContainer.style.display = 'none';
            formContainer.style.display = 'block';
        };
        resultContainer.appendChild(backBtn);
        
        // Close on result too
        const closeResultBtn = document.createElement('button');
        closeResultBtn.innerText = 'Đóng';
        closeResultBtn.style.marginTop = '10px';
        closeResultBtn.style.width = '100%';
        closeResultBtn.style.padding = '10px';
        closeResultBtn.style.backgroundColor = '#9C27B0';
        closeResultBtn.style.border = 'none';
        closeResultBtn.style.borderRadius = '4px';
        closeResultBtn.style.color = 'white';
        closeResultBtn.style.cursor = 'pointer';
        closeResultBtn.onclick = () => this.hide();
        resultContainer.appendChild(closeResultBtn);

        this.container.appendChild(resultContainer);

        document.body.appendChild(this.container);
    }

    private createInputGroup(labelText: string): HTMLDivElement {
        const group = document.createElement('div');
        const label = document.createElement('label');
        label.innerText = labelText;
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        label.style.fontSize = '14px';
        label.style.color = '#aaa';
        group.appendChild(label);
        return group;
    }

    public show() {
        if (!this.isVisible) {
            this.container.style.display = 'block';
            this.isVisible = true;
            
            // Reset to form
            const form = this.container.querySelector('#horoscope-form') as HTMLElement;
            const result = this.container.querySelector('#horoscope-result') as HTMLElement;
            if (form) form.style.display = 'block';
            if (result) result.style.display = 'none';
        }
    }

    public hide() {
        if (this.isVisible) {
            this.container.style.display = 'none';
            this.isVisible = false;
            if (this.onClose) {
                this.onClose();
            }
        }
    }

    public destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
