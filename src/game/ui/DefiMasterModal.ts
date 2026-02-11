import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { DefiMasterService, DEFI_TOPICS } from '../DefiMasterService';

type DefiStep = 'ask' | 'loading' | 'answer';

export class DefiMasterModal {
    private scene: Scene;
    private container: HTMLDivElement;
    private backdrop: HTMLDivElement | null = null;
    private isVisible: boolean = false;
    public onClose?: () => void;

    // State
    private currentStep: DefiStep = 'ask';
    private selectedTopic: string = 'general';
    private question: string = '';
    private answer: string = '';
    private displayedAnswer: string = '';
    private typingInterval: number | null = null;

    // Styles
    private readonly COLORS = {
        bg: '#0a1628',
        bgGradient: 'linear-gradient(135deg, #0a1628 0%, #1a2d4a 50%, #0d1f35 100%)',
        border: '#00d4ff',
        accent: '#00d4ff',
        accentGlow: 'rgba(0, 212, 255, 0.4)',
        gold: '#FFD700',
        text: '#e0f7ff',
        textMuted: '#7eb8c9',
        cardBg: '#0d2137',
        cardBorder: '#1a4a6e'
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.createModal();
    }

    private reset() {
        this.currentStep = 'ask';
        this.question = '';
        this.answer = '';
        this.displayedAnswer = '';
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
    }

    private createModal() {
        // Create backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.id = 'defi-master-backdrop';
        Object.assign(this.backdrop.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 20, 40, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'none',
            zIndex: '999'
        });
        this.backdrop.onclick = () => this.hide();
        document.body.appendChild(this.backdrop);

        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'defi-master-modal';
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '480px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            background: this.COLORS.bgGradient,
            border: `2px solid ${this.COLORS.border}`,
            borderRadius: '16px',
            padding: '0',
            color: this.COLORS.text,
            fontFamily: 'Arial, sans-serif',
            zIndex: '1000',
            display: 'none',
            boxShadow: `0 0 40px ${this.COLORS.accentGlow}, inset 0 0 60px rgba(0, 212, 255, 0.05)`,
            overflow: 'hidden',
            pointerEvents: 'auto'
        });

        // Prevent event propagation
        ['wheel', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(evt => {
            this.container.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Add custom styles
        const style = document.createElement('style');
        style.innerHTML = `
            #defi-master-modal::-webkit-scrollbar { display: none; }
            #defi-master-modal { -ms-overflow-style: none; scrollbar-width: none; }
            #defi-master-modal *::-webkit-scrollbar { display: none; }
            #defi-master-modal * { -ms-overflow-style: none; scrollbar-width: none; }
            #defi-master-modal .defi-topic-btn:hover { 
                background: linear-gradient(135deg, ${this.COLORS.accent}33 0%, ${this.COLORS.cardBg} 100%) !important;
                transform: translateY(-2px);
                box-shadow: 0 4px 15px ${this.COLORS.accentGlow};
            }
            #defi-master-modal .defi-glow-text {
                text-shadow: 0 0 10px ${this.COLORS.accentGlow}, 0 0 20px ${this.COLORS.accentGlow};
            }
            @keyframes defiPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.05); }
            }
            @keyframes defiTyping {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            @keyframes defiFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes defiScan {
                0% { background-position: 0% 0%; }
                100% { background-position: 200% 0%; }
            }
        `;
        this.container.appendChild(style);

        document.body.appendChild(this.container);
    }

    private renderContent() {
        const style = this.container.querySelector('style');
        this.container.innerHTML = '';
        if (style) this.container.appendChild(style);

        // Header with cyber effect
        const header = this.createHeader();
        this.container.appendChild(header);

        // Content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.style.padding = '20px';
        contentWrapper.style.maxHeight = 'calc(90vh - 100px)';
        contentWrapper.style.overflowY = 'auto';

        switch (this.currentStep) {
            case 'ask':
                this.renderAskStep(contentWrapper);
                break;
            case 'loading':
                this.renderLoadingStep(contentWrapper);
                break;
            case 'answer':
                this.renderAnswerStep(contentWrapper);
                break;
        }

        this.container.appendChild(contentWrapper);
    }

    private createHeader(): HTMLElement {
        const header = document.createElement('div');
        Object.assign(header.style, {
            background: 'linear-gradient(90deg, rgba(0,212,255,0.1) 0%, rgba(0,212,255,0.2) 50%, rgba(0,212,255,0.1) 100%)',
            borderBottom: `1px solid ${this.COLORS.cardBorder}`,
            padding: '15px 20px',
            position: 'relative',
            overflow: 'hidden'
        });

        // Scan line effect
        const scanLine = document.createElement('div');
        Object.assign(scanLine.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            background: 'linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.1) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'defiScan 3s linear infinite',
            pointerEvents: 'none'
        });
        header.appendChild(scanLine);

        // Title
        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.justifyContent = 'center';
        titleContainer.style.gap = '12px';

        const icon = document.createElement('span');
        icon.innerHTML = '🤵';
        icon.style.fontSize = '28px';
        icon.style.animation = 'defiFloat 2s ease-in-out infinite';

        const title = document.createElement('h2');
        title.innerHTML = 'DeFi Master';
        title.className = 'defi-glow-text';
        Object.assign(title.style, {
            color: this.COLORS.accent,
            margin: '0',
            fontSize: '22px',
            fontWeight: 'bold',
            letterSpacing: '2px'
        });

        titleContainer.appendChild(icon);
        titleContainer.appendChild(title);
        header.appendChild(titleContainer);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.innerText = 'Hỏi đáp kiến thức DeFi';
        Object.assign(subtitle.style, {
            color: this.COLORS.textMuted,
            margin: '5px 0 0 0',
            fontSize: '12px',
            textAlign: 'center'
        });
        header.appendChild(subtitle);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '10px',
            right: '15px',
            background: 'none',
            border: 'none',
            color: this.COLORS.textMuted,
            fontSize: '20px',
            cursor: 'pointer',
            padding: '5px',
            transition: 'all 0.2s'
        });
        closeBtn.onmouseenter = () => { closeBtn.style.color = this.COLORS.accent; };
        closeBtn.onmouseleave = () => { closeBtn.style.color = this.COLORS.textMuted; };
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        return header;
    }

    private renderAskStep(container: HTMLElement) {
        // Topic selection
        const topicSection = document.createElement('div');
        topicSection.style.marginBottom = '20px';

        const topicLabel = document.createElement('p');
        topicLabel.innerText = '📌 Chọn chủ đề:';
        Object.assign(topicLabel.style, {
            color: this.COLORS.accent,
            fontSize: '13px',
            marginBottom: '10px'
        });
        topicSection.appendChild(topicLabel);

        const topicGrid = document.createElement('div');
        topicGrid.style.display = 'flex';
        topicGrid.style.flexWrap = 'wrap';
        topicGrid.style.gap = '8px';

        DEFI_TOPICS.forEach(topic => {
            const btn = document.createElement('button');
            btn.className = 'defi-topic-btn';
            const isSelected = this.selectedTopic === topic.id;
            Object.assign(btn.style, {
                padding: '8px 14px',
                borderRadius: '20px',
                border: `1px solid ${isSelected ? this.COLORS.accent : this.COLORS.cardBorder}`,
                background: isSelected ? `linear-gradient(135deg, ${this.COLORS.accent}33 0%, ${this.COLORS.cardBg} 100%)` : this.COLORS.cardBg,
                color: isSelected ? this.COLORS.accent : this.COLORS.text,
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.2s',
                boxShadow: isSelected ? `0 0 15px ${this.COLORS.accentGlow}` : 'none'
            });
            btn.innerHTML = `${topic.emoji} ${topic.name}`;
            btn.onclick = () => {
                this.selectedTopic = topic.id;
                this.renderContent();
            };
            topicGrid.appendChild(btn);
        });

        topicSection.appendChild(topicGrid);
        container.appendChild(topicSection);

        // Question input
        const questionSection = document.createElement('div');
        questionSection.style.marginBottom = '20px';

        const questionLabel = document.createElement('p');
        questionLabel.innerText = '❓ Câu hỏi của bạn:';
        Object.assign(questionLabel.style, {
            color: this.COLORS.accent,
            fontSize: '13px',
            marginBottom: '10px'
        });
        questionSection.appendChild(questionLabel);

        const textarea = document.createElement('textarea');
        textarea.value = this.question;
        textarea.placeholder = 'Ví dụ: Impermanent Loss là gì? Làm sao để yield farming an toàn?...';
        Object.assign(textarea.style, {
            width: '100%',
            height: '100px',
            padding: '12px',
            background: this.COLORS.cardBg,
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: '10px',
            color: this.COLORS.text,
            fontSize: '14px',
            resize: 'none',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'all 0.2s'
        });
        textarea.onfocus = () => {
            textarea.style.borderColor = this.COLORS.accent;
            textarea.style.boxShadow = `0 0 15px ${this.COLORS.accentGlow}`;
        };
        textarea.onblur = () => {
            textarea.style.borderColor = this.COLORS.cardBorder;
            textarea.style.boxShadow = 'none';
        };
        textarea.oninput = (e) => {
            this.question = (e.target as HTMLTextAreaElement).value;
        };
        questionSection.appendChild(textarea);
        container.appendChild(questionSection);

        // Cost info
        const costInfo = document.createElement('div');
        Object.assign(costInfo.style, {
            background: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.05) 100%)',
            border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: '8px',
            padding: '10px 15px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
        });
        costInfo.innerHTML = `
            <span style="font-size: 18px;">🪙</span>
            <span style="color: ${this.COLORS.gold}; font-size: 13px;">Chi phí: 30 Gold / câu hỏi</span>
        `;
        container.appendChild(costInfo);

        // Submit button
        const submitBtn = this.createButton('🚀 Gửi câu hỏi', this.COLORS.accent, async () => {
            if (!this.question.trim()) {
                alert('Vui lòng nhập câu hỏi!');
                return;
            }
            this.currentStep = 'loading';
            this.renderContent();
            await this.submitQuestion();
        });
        submitBtn.style.width = '100%';
        container.appendChild(submitBtn);

        // Close button
        const closeBtn = this.createButton('Đóng', this.COLORS.cardBorder, () => this.hide());
        closeBtn.style.width = '100%';
        closeBtn.style.marginTop = '10px';
        container.appendChild(closeBtn);
    }

    private renderLoadingStep(container: HTMLElement) {
        const loadingContainer = document.createElement('div');
        Object.assign(loadingContainer.style, {
            textAlign: 'center',
            padding: '40px 20px'
        });

        // Animated icon
        const icon = document.createElement('div');
        icon.innerHTML = '🤵';
        Object.assign(icon.style, {
            fontSize: '60px',
            marginBottom: '20px',
            animation: 'defiPulse 1.5s ease-in-out infinite'
        });
        loadingContainer.appendChild(icon);

        // Loading text
        const loadingText = document.createElement('p');
        loadingText.className = 'defi-glow-text';
        loadingText.innerHTML = 'DeFi Master đang suy nghĩ...';
        Object.assign(loadingText.style, {
            color: this.COLORS.accent,
            fontSize: '16px',
            marginBottom: '15px'
        });
        loadingContainer.appendChild(loadingText);

        // Progress bar
        const progressContainer = document.createElement('div');
        Object.assign(progressContainer.style, {
            width: '200px',
            height: '4px',
            background: this.COLORS.cardBg,
            borderRadius: '2px',
            margin: '0 auto',
            overflow: 'hidden'
        });

        const progressBar = document.createElement('div');
        Object.assign(progressBar.style, {
            width: '30%',
            height: '100%',
            background: `linear-gradient(90deg, ${this.COLORS.accent}, ${this.COLORS.gold})`,
            borderRadius: '2px',
            animation: 'defiScan 1.5s ease-in-out infinite'
        });
        progressContainer.appendChild(progressBar);
        loadingContainer.appendChild(progressContainer);

        // Hint text
        const hint = document.createElement('p');
        hint.innerText = 'Đang phân tích câu hỏi của bạn...';
        Object.assign(hint.style, {
            color: this.COLORS.textMuted,
            fontSize: '12px',
            marginTop: '15px'
        });
        loadingContainer.appendChild(hint);

        container.appendChild(loadingContainer);
    }

    private renderAnswerStep(container: HTMLElement) {
        // Question recap
        const questionRecap = document.createElement('div');
        Object.assign(questionRecap.style, {
            background: this.COLORS.cardBg,
            borderRadius: '10px',
            padding: '12px 15px',
            marginBottom: '15px',
            borderLeft: `3px solid ${this.COLORS.accent}`
        });
        questionRecap.innerHTML = `
            <p style="color: ${this.COLORS.textMuted}; font-size: 11px; margin: 0 0 5px 0;">Câu hỏi của bạn:</p>
            <p style="color: ${this.COLORS.text}; font-size: 13px; margin: 0; font-style: italic;">"${this.question}"</p>
        `;
        container.appendChild(questionRecap);

        // Answer section
        const answerSection = document.createElement('div');
        Object.assign(answerSection.style, {
            background: 'linear-gradient(135deg, rgba(0,212,255,0.05) 0%, rgba(0,212,255,0.02) 100%)',
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            maxHeight: '350px',
            overflowY: 'auto'
        });

        // Master icon and title
        const answerHeader = document.createElement('div');
        answerHeader.style.display = 'flex';
        answerHeader.style.alignItems = 'center';
        answerHeader.style.gap = '10px';
        answerHeader.style.marginBottom = '15px';
        answerHeader.innerHTML = `
            <span style="font-size: 24px; animation: defiFloat 2s ease-in-out infinite;">🤵</span>
            <span style="color: ${this.COLORS.accent}; font-size: 14px; font-weight: bold;" class="defi-glow-text">DeFi Master nói:</span>
        `;
        answerSection.appendChild(answerHeader);

        // Answer text with typing effect
        const answerText = document.createElement('div');
        Object.assign(answerText.style, {
            color: this.COLORS.text,
            fontSize: '14px',
            lineHeight: '1.8',
            whiteSpace: 'pre-wrap'
        });
        answerText.innerHTML = this.formatAnswer(this.displayedAnswer);
        
        // Typing cursor
        if (this.displayedAnswer.length < this.answer.length) {
            const cursor = document.createElement('span');
            cursor.innerHTML = '▋';
            cursor.style.animation = 'defiTyping 0.5s infinite';
            cursor.style.color = this.COLORS.accent;
            answerText.appendChild(cursor);
        }
        
        answerSection.appendChild(answerText);
        container.appendChild(answerSection);

        // Buttons
        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '10px';

        const askAgainBtn = this.createButton('🔄 Hỏi tiếp', this.COLORS.cardBorder, () => {
            this.reset();
            this.renderContent();
        });
        askAgainBtn.style.flex = '1';

        const closeBtn = this.createButton('✓ Đóng', this.COLORS.accent, () => this.hide());
        closeBtn.style.flex = '1';

        btnGroup.appendChild(askAgainBtn);
        btnGroup.appendChild(closeBtn);
        container.appendChild(btnGroup);
    }

    private formatAnswer(text: string): string {
        // Convert markdown-like formatting to HTML
        return text
            .replace(/\*\*(.*?)\*\*/g, `<strong style="color: ${this.COLORS.accent};">$1</strong>`)
            .replace(/\n\n/g, '</p><p style="margin: 10px 0;">')
            .replace(/\n/g, '<br>');
    }

    private async submitQuestion() {
        try {
            const result = await DefiMasterService.askQuestion({
                question: this.question,
                topic: this.selectedTopic as any
            });

            if (result.success && result.content) {
                this.answer = result.content;
                this.displayedAnswer = '';
                this.currentStep = 'answer';
                this.renderContent();
                
                // Start typing effect
                this.startTypingEffect();

                // Update gold if returned
                if (result.remainingGold !== undefined) {
                    EventBus.emit('currency-updated', { gold: result.remainingGold });
                }
            } else {
                this.answer = result.error || 'Có lỗi xảy ra, vui lòng thử lại!';
                this.displayedAnswer = this.answer;
                this.currentStep = 'answer';
                this.renderContent();
            }
        } catch (error) {
            console.error('DefiMaster error:', error);
            this.answer = 'Không thể kết nối đến DeFi Master. Vui lòng thử lại sau!';
            this.displayedAnswer = this.answer;
            this.currentStep = 'answer';
            this.renderContent();
        }
    }

    private startTypingEffect() {
        const charsPerTick = 3; // Characters per interval
        const tickInterval = 20; // ms between ticks

        this.typingInterval = window.setInterval(() => {
            if (this.displayedAnswer.length < this.answer.length) {
                this.displayedAnswer = this.answer.substring(0, this.displayedAnswer.length + charsPerTick);
                
                // Update only the answer text element
                const answerText = this.container.querySelector('div[style*="line-height: 1.8"]');
                if (answerText) {
                    answerText.innerHTML = this.formatAnswer(this.displayedAnswer);
                    
                    // Add cursor if still typing
                    if (this.displayedAnswer.length < this.answer.length) {
                        const cursor = document.createElement('span');
                        cursor.innerHTML = '▋';
                        cursor.style.animation = 'defiTyping 0.5s infinite';
                        cursor.style.color = this.COLORS.accent;
                        answerText.appendChild(cursor);
                    }

                    // Auto scroll to bottom
                    const scrollContainer = answerText.parentElement;
                    if (scrollContainer) {
                        scrollContainer.scrollTop = scrollContainer.scrollHeight;
                    }
                }
            } else {
                // Typing complete
                if (this.typingInterval) {
                    clearInterval(this.typingInterval);
                    this.typingInterval = null;
                }
            }
        }, tickInterval);
    }

    private createButton(text: string, bgColor: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerText = text;
        Object.assign(btn.style, {
            padding: '12px 20px',
            background: bgColor === this.COLORS.accent 
                ? `linear-gradient(135deg, ${this.COLORS.accent} 0%, #0099cc 100%)`
                : bgColor,
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            boxShadow: bgColor === this.COLORS.accent ? `0 4px 15px ${this.COLORS.accentGlow}` : 'none'
        });
        btn.onmouseenter = () => { 
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = `0 6px 20px ${this.COLORS.accentGlow}`;
        };
        btn.onmouseleave = () => { 
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = bgColor === this.COLORS.accent ? `0 4px 15px ${this.COLORS.accentGlow}` : 'none';
        };
        btn.onclick = onClick;
        return btn;
    }

    public show() {
        if (!this.isVisible) {
            this.reset();
            if (this.backdrop) {
                this.backdrop.style.display = 'block';
            }
            this.container.style.display = 'block';
            this.isVisible = true;
            this.renderContent();
        }
    }

    public hide() {
        if (this.isVisible) {
            if (this.typingInterval) {
                clearInterval(this.typingInterval);
                this.typingInterval = null;
            }
            if (this.backdrop) {
                this.backdrop.style.display = 'none';
            }
            this.container.style.display = 'none';
            this.isVisible = false;
            if (this.onClose) {
                this.onClose();
            }
        }
    }

    public destroy() {
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.backdrop && this.backdrop.parentNode) {
            this.backdrop.parentNode.removeChild(this.backdrop);
        }
    }
}
