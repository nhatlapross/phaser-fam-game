import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import {
    TarotService,
    SPREADS,
    SPREAD_COSTS,
    TOPICS,
    TAROT_CARDS,
    SpreadConfig,
    Topic,
    TarotCard,
    DrawnCard,
    AIInterpretation,
    shuffleArray,
    getRandomOrientation
} from '../TarotService';

type TarotStep = 'select-spread' | 'question' | 'draw' | 'loading' | 'result';

export class TarotModal {
    private scene: Scene;
    private container: HTMLDivElement;
    private backdrop: HTMLDivElement | null = null;
    private cardOverlay: HTMLDivElement | null = null;
    private isVisible: boolean = false;
    private processing: boolean = false;
    public onClose?: () => void;

    // State
    private currentStep: TarotStep = 'select-spread';
    private selectedSpread: SpreadConfig | null = null;
    private selectedTopic: Topic | null = null;
    private question: string = '';
    private availableCards: TarotCard[] = [];
    private drawnCards: DrawnCard[] = [];
    private interpretation: AIInterpretation | null = null;

    // Styles
    private readonly COLORS = {
        bg: '#1a1a2e',
        border: '#E91E63',
        accent: '#E91E63',
        accentLight: '#F48FB1',
        text: '#fff',
        textMuted: '#aaa',
        cardBg: '#2d2d44',
        cardBorder: '#4a4a6a'
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.createModal();
        this.reset();
    }

    private reset() {
        this.currentStep = 'select-spread';
        this.selectedSpread = null;
        this.selectedTopic = null;
        this.question = '';
        this.availableCards = shuffleArray([...TAROT_CARDS]);
        this.drawnCards = [];
        this.interpretation = null;
    }

    private createModal() {
        this.container = document.createElement('div');
        this.container.id = 'tarot-modal';
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '450px',
            maxHeight: '90vh',
            backgroundColor: this.COLORS.bg,
            border: `2px solid ${this.COLORS.border}`,
            borderRadius: '12px',
            padding: '20px',
            color: this.COLORS.text,
            fontFamily: 'Arial, sans-serif',
            zIndex: '1000',
            display: 'none',
            boxShadow: `0 0 30px rgba(233, 30, 99, 0.4)`,
            overflowY: 'auto',
            pointerEvents: 'auto'
        });

        // Prevent event propagation
        ['wheel', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(evt => {
            this.container.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Custom scrollbar
        const style = document.createElement('style');
        style.innerHTML = `
            #tarot-modal::-webkit-scrollbar { width: 8px; }
            #tarot-modal::-webkit-scrollbar-track { background: ${this.COLORS.bg}; border-radius: 4px; }
            #tarot-modal::-webkit-scrollbar-thumb { background: ${this.COLORS.accent}; border-radius: 4px; }
            #tarot-modal::-webkit-scrollbar-thumb:hover { background: ${this.COLORS.accentLight}; }
            #tarot-modal .tarot-card-hover:hover { transform: translateY(-8px) scale(1.05); box-shadow: 0 8px 20px rgba(233, 30, 99, 0.4); }
        `;
        this.container.appendChild(style);

        document.body.appendChild(this.container);
        
        // Create backdrop overlay
        this.createBackdrop();
        
        // Create card overlay for enlarged view
        this.createCardOverlay();
    }

    private createBackdrop() {
        this.backdrop = document.createElement('div');
        this.backdrop.id = 'tarot-backdrop';
        Object.assign(this.backdrop.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'none',
            zIndex: '999'
        });
        
        this.backdrop.onclick = () => this.hide();
        document.body.appendChild(this.backdrop);
    }

    private createCardOverlay() {
        this.cardOverlay = document.createElement('div');
        this.cardOverlay.id = 'tarot-card-overlay';
        Object.assign(this.cardOverlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '2000',
            cursor: 'pointer',
            flexDirection: 'column',
            gap: '20px'
        });

        this.cardOverlay.onclick = () => this.hideCardOverlay();
        document.body.appendChild(this.cardOverlay);
    }

    private showCardOverlay(drawn: DrawnCard) {
        if (!this.cardOverlay) return;

        const isImagePath = drawn.card.image.startsWith('/');
        
        this.cardOverlay.innerHTML = `
            <div style="text-align: center; max-width: 90vw;">
                <div style="
                    display: inline-block;
                    padding: 15px;
                    background: linear-gradient(135deg, ${this.COLORS.cardBg} 0%, ${this.COLORS.bg} 100%);
                    border: 3px solid ${this.COLORS.accent};
                    border-radius: 12px;
                    box-shadow: 0 0 40px rgba(233, 30, 99, 0.5);
                    transform: ${drawn.orientation === 'reversed' ? 'rotate(180deg)' : 'none'};
                ">
                    ${isImagePath 
                        ? `<img src="${drawn.card.image}" style="max-width: 250px; max-height: 400px; object-fit: contain; display: block;" alt="${drawn.card.name.vi}" />`
                        : `<span style="font-size: 120px; display: block;">${drawn.card.image}</span>`
                    }
                </div>
                <div style="margin-top: 20px; transform: ${drawn.orientation === 'reversed' ? 'none' : 'none'};">
                    <h3 style="color: ${this.COLORS.accentLight}; font-size: 22px; margin: 0 0 8px 0;">
                        ${drawn.card.name.vi}
                    </h3>
                    <p style="color: ${this.COLORS.text}; font-size: 14px; margin: 0 0 5px 0;">
                        ${drawn.card.name.en}
                    </p>
                    <p style="color: ${drawn.orientation === 'reversed' ? '#ff6b6b' : '#4CAF50'}; font-size: 13px; margin: 0 0 10px 0;">
                        ${drawn.orientation === 'upright' ? '⬆️ Xuôi' : '⬇️ Ngược'}
                    </p>
                    <p style="color: #FFD700; font-size: 12px; margin: 0 0 5px 0;">
                        📍 Vị trí: ${drawn.position.name.vi}
                    </p>
                    <div style="
                        margin-top: 15px;
                        padding: 12px 20px;
                        background: ${this.COLORS.cardBg};
                        border-radius: 8px;
                        max-width: 350px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        <p style="color: ${this.COLORS.textMuted}; font-size: 11px; margin: 0 0 5px 0;">
                            Ý nghĩa ${drawn.orientation === 'upright' ? '(Xuôi)' : '(Ngược)'}:
                        </p>
                        <p style="color: ${this.COLORS.text}; font-size: 13px; margin: 0; line-height: 1.5;">
                            ${drawn.orientation === 'upright' ? drawn.card.meanings.upright.vi : drawn.card.meanings.reversed.vi}
                        </p>
                    </div>
                </div>
                <p style="color: ${this.COLORS.textMuted}; font-size: 11px; margin-top: 20px;">
                    Nhấn để đóng
                </p>
            </div>
        `;

        this.cardOverlay.style.display = 'flex';
    }

    private hideCardOverlay() {
        if (this.cardOverlay) {
            this.cardOverlay.style.display = 'none';
        }
    }

    private renderContent() {
        // Clear content except style
        const style = this.container.querySelector('style');
        this.container.innerHTML = '';
        if (style) this.container.appendChild(style);

        // Header
        const header = this.createHeader();
        this.container.appendChild(header);

        // Content based on step
        switch (this.currentStep) {
            case 'select-spread':
                this.renderSpreadSelection();
                break;
            case 'question':
                this.renderQuestionInput();
                break;
            case 'draw':
                this.renderCardDrawing();
                break;
            case 'loading':
                this.renderLoading();
                break;
            case 'result':
                this.renderResult();
                break;
        }
    }

    private createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.style.marginBottom = '20px';
        header.style.textAlign = 'center';
        header.style.position = 'relative';

        const title = document.createElement('h2');
        title.innerText = '🔮 Tarot Reading';
        title.style.color = this.COLORS.accentLight;
        title.style.margin = '0 0 5px 0';
        title.style.fontSize = '20px';
        header.appendChild(title);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '0',
            right: '0',
            background: 'none',
            border: 'none',
            color: this.COLORS.textMuted,
            fontSize: '18px',
            cursor: 'pointer',
            padding: '5px'
        });
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        // Step indicator
        if (this.currentStep !== 'loading') {
            const steps = ['select-spread', 'question', 'draw', 'result'];
            const currentIdx = steps.indexOf(this.currentStep);
            const stepIndicator = document.createElement('div');
            stepIndicator.style.display = 'flex';
            stepIndicator.style.justifyContent = 'center';
            stepIndicator.style.gap = '8px';
            stepIndicator.style.marginTop = '10px';

            steps.forEach((_, idx) => {
                const dot = document.createElement('div');
                Object.assign(dot.style, {
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: idx <= currentIdx ? this.COLORS.accent : this.COLORS.cardBorder
                });
                stepIndicator.appendChild(dot);
            });
            header.appendChild(stepIndicator);
        }

        return header;
    }


    private renderSpreadSelection() {
        const content = document.createElement('div');

        const subtitle = document.createElement('p');
        subtitle.innerText = 'Chọn kiểu trải bài:';
        subtitle.style.color = this.COLORS.textMuted;
        subtitle.style.marginBottom = '15px';
        subtitle.style.textAlign = 'center';
        content.appendChild(subtitle);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gap = '10px';
        grid.style.marginBottom = '20px';

        const spreadIcons: Record<string, string> = {
            'single': '🎴',
            'three-card': '🃏',
            'five-card': '✨',
            'celtic-cross': '🌟'
        };

        SPREADS.forEach(spread => {
            const card = document.createElement('div');
            Object.assign(card.style, {
                backgroundColor: this.COLORS.cardBg,
                border: `1px solid ${this.COLORS.cardBorder}`,
                borderRadius: '8px',
                padding: '15px 10px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
            });
            card.className = 'tarot-card-hover';

            card.innerHTML = `
                <div style="font-size: 28px; margin-bottom: 8px;">${spreadIcons[spread.type]}</div>
                <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">${spread.name.vi}</div>
                <div style="font-size: 11px; color: ${this.COLORS.accent};">${spread.cardCount} lá</div>
                <div style="font-size: 10px; color: ${this.COLORS.textMuted}; margin-top: 4px;">${spread.description.vi}</div>
                <div style="font-size: 11px; color: #FFD700; margin-top: 6px; font-weight: bold;">🪙 ${SPREAD_COSTS[spread.type]} Gold</div>
            `;

            card.onclick = () => {
                this.selectedSpread = spread;
                this.currentStep = 'question';
                this.renderContent();
            };

            grid.appendChild(card);
        });

        content.appendChild(grid);

        // Close button
        const closeBtn = this.createButton('Đóng', this.COLORS.cardBorder, () => this.hide());
        closeBtn.style.width = '100%';
        content.appendChild(closeBtn);

        this.container.appendChild(content);
    }

    private renderQuestionInput() {
        const content = document.createElement('div');

        // Back button
        const backBtn = document.createElement('button');
        backBtn.innerHTML = '← Quay lại';
        Object.assign(backBtn.style, {
            background: 'none',
            border: 'none',
            color: this.COLORS.textMuted,
            cursor: 'pointer',
            marginBottom: '15px',
            fontSize: '12px'
        });
        backBtn.onclick = () => {
            this.currentStep = 'select-spread';
            this.renderContent();
        };
        content.appendChild(backBtn);

        // Spread info
        if (this.selectedSpread) {
            const spreadInfo = document.createElement('div');
            spreadInfo.style.textAlign = 'center';
            spreadInfo.style.marginBottom = '20px';
            spreadInfo.innerHTML = `
                <div style="font-size: 14px; color: ${this.COLORS.accent};">
                    ${this.selectedSpread.name.vi} (${this.selectedSpread.cardCount} lá)
                </div>
                <div style="font-size: 12px; color: #FFD700; margin-top: 5px;">
                    🪙 Chi phí: ${SPREAD_COSTS[this.selectedSpread.type]} Gold
                </div>
            `;
            content.appendChild(spreadInfo);
        }

        // Topic selection
        const topicLabel = document.createElement('p');
        topicLabel.innerText = 'Chọn chủ đề (tùy chọn):';
        topicLabel.style.color = this.COLORS.textMuted;
        topicLabel.style.marginBottom = '10px';
        topicLabel.style.fontSize = '13px';
        content.appendChild(topicLabel);

        const topicGrid = document.createElement('div');
        topicGrid.style.display = 'flex';
        topicGrid.style.flexWrap = 'wrap';
        topicGrid.style.gap = '8px';
        topicGrid.style.marginBottom = '20px';

        TOPICS.forEach(topic => {
            const btn = document.createElement('button');
            const isSelected = this.selectedTopic === topic.value;
            Object.assign(btn.style, {
                padding: '6px 12px',
                borderRadius: '20px',
                border: `1px solid ${isSelected ? this.COLORS.accent : this.COLORS.cardBorder}`,
                backgroundColor: isSelected ? `${this.COLORS.accent}33` : 'transparent',
                color: isSelected ? this.COLORS.accentLight : this.COLORS.text,
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.2s'
            });
            btn.innerHTML = `${topic.icon} ${topic.label.vi}`;
            btn.onclick = () => {
                this.selectedTopic = this.selectedTopic === topic.value ? null : topic.value;
                this.renderContent();
            };
            topicGrid.appendChild(btn);
        });
        content.appendChild(topicGrid);

        // Question input
        const questionLabel = document.createElement('p');
        questionLabel.innerText = 'Câu hỏi của bạn:';
        questionLabel.style.color = this.COLORS.textMuted;
        questionLabel.style.marginBottom = '8px';
        questionLabel.style.fontSize = '13px';
        content.appendChild(questionLabel);

        const textarea = document.createElement('textarea');
        textarea.value = this.question;
        textarea.placeholder = 'Nhập câu hỏi bạn muốn hỏi...';
        Object.assign(textarea.style, {
            width: '100%',
            height: '80px',
            padding: '10px',
            backgroundColor: this.COLORS.cardBg,
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: '8px',
            color: this.COLORS.text,
            fontSize: '13px',
            resize: 'none',
            marginBottom: '20px',
            boxSizing: 'border-box'
        });
        textarea.oninput = (e) => {
            this.question = (e.target as HTMLTextAreaElement).value;
        };
        textarea.addEventListener('keydown', (e) => e.stopPropagation());
        textarea.addEventListener('keyup', (e) => e.stopPropagation());
        textarea.addEventListener('keypress', (e) => e.stopPropagation());
        content.appendChild(textarea);

        // Continue button
        const continueBtn = this.createButton('Tiếp tục rút bài →', this.COLORS.accent, () => {
            if (!this.question.trim()) {
                alert('Vui lòng nhập câu hỏi!');
                return;
            }
            this.currentStep = 'draw';
            this.renderContent();
        });
        continueBtn.style.width = '100%';
        content.appendChild(continueBtn);

        this.container.appendChild(content);
    }

    private renderCardDrawing() {
        const content = document.createElement('div');

        if (!this.selectedSpread) return;

        const cardsNeeded = this.selectedSpread.cardCount;
        const cardsRemaining = cardsNeeded - this.drawnCards.length;
        const currentPosition = this.selectedSpread.positions[this.drawnCards.length];

        // Info
        const info = document.createElement('div');
        info.style.textAlign = 'center';
        info.style.marginBottom = '20px';

        info.innerHTML = `
            <p style="color: ${this.COLORS.textMuted}; margin: 0 0 8px 0; font-size: 13px;">
                Chọn ${cardsRemaining} lá bài nữa
            </p>
            ${currentPosition ? `
                <p style="color: ${this.COLORS.accent}; margin: 0; font-size: 12px;">
                    Vị trí: ${currentPosition.name.vi}
                </p>
            ` : ''}
        `;
        content.appendChild(info);

        // Card deck (fan layout)
        const deckContainer = document.createElement('div');
        Object.assign(deckContainer.style, {
            position: 'relative',
            height: '140px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '20px'
        });

        const displayCards = this.availableCards.slice(0, 15);
        displayCards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            const angle = (index - displayCards.length / 2) * 4;
            const xOffset = (index - displayCards.length / 2) * 18;

            Object.assign(cardEl.style, {
                position: 'absolute',
                width: '50px',
                height: '75px',
                borderRadius: '6px',
                background: `linear-gradient(135deg, #4a1942 0%, #2d1a3d 50%, #1a1a2e 100%)`,
                border: `2px solid ${this.COLORS.accent}66`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                cursor: 'pointer',
                transform: `translateX(${xOffset}px) rotate(${angle}deg)`,
                transformOrigin: 'bottom center',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                zIndex: index.toString()
            });
            cardEl.innerHTML = '🔮';

            cardEl.onmouseenter = () => {
                cardEl.style.transform = `translateX(${xOffset}px) rotate(${angle}deg) translateY(-15px) scale(1.1)`;
                cardEl.style.zIndex = '100';
                cardEl.style.boxShadow = `0 8px 20px rgba(233, 30, 99, 0.5)`;
            };
            cardEl.onmouseleave = () => {
                cardEl.style.transform = `translateX(${xOffset}px) rotate(${angle}deg)`;
                cardEl.style.zIndex = index.toString();
                cardEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
            };

            cardEl.onclick = () => {
                if (!currentPosition) return;
                this.drawCard(card, currentPosition, index);
            };

            deckContainer.appendChild(cardEl);
        });

        content.appendChild(deckContainer);

        // Drawn cards preview
        if (this.drawnCards.length > 0) {
            const drawnSection = document.createElement('div');
            drawnSection.innerHTML = `
                <p style="text-align: center; color: ${this.COLORS.textMuted}; font-size: 12px; margin-bottom: 10px;">
                    Đã rút: ${this.drawnCards.length}/${cardsNeeded}
                </p>
            `;

            const drawnGrid = document.createElement('div');
            drawnGrid.style.display = 'flex';
            drawnGrid.style.justifyContent = 'center';
            drawnGrid.style.gap = '10px';
            drawnGrid.style.flexWrap = 'wrap';

            this.drawnCards.forEach(drawn => {
                const drawnCard = document.createElement('div');
                Object.assign(drawnCard.style, {
                    width: '45px',
                    height: '68px',
                    borderRadius: '5px',
                    backgroundColor: this.COLORS.cardBg,
                    border: `2px solid ${this.COLORS.accent}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    transform: drawn.orientation === 'reversed' ? 'rotate(180deg)' : 'none',
                    overflow: 'hidden'
                });
                
                // Use image if available
                const cardImageHtml = drawn.card.image.startsWith('/') 
                    ? `<img src="${drawn.card.image}" style="width: 40px; height: auto; object-fit: contain;" alt="${drawn.card.name.vi}" />`
                    : `<span>${drawn.card.image}</span>`;
                
                drawnCard.innerHTML = `
                    ${cardImageHtml}
                    <span style="font-size: 8px; color: ${this.COLORS.textMuted}; transform: ${drawn.orientation === 'reversed' ? 'rotate(180deg)' : 'none'}; position: absolute; bottom: 2px;">
                        ${drawn.position.name.vi}
                    </span>
                `;
                drawnCard.style.position = 'relative';
                drawnGrid.appendChild(drawnCard);
            });

            drawnSection.appendChild(drawnGrid);
            content.appendChild(drawnSection);
        }

        this.container.appendChild(content);
    }

    private drawCard(card: TarotCard, position: any, index: number) {
        const orientation = getRandomOrientation();
        const drawnCard: DrawnCard = { card, orientation, position };

        this.drawnCards.push(drawnCard);
        this.availableCards = this.availableCards.filter((_, i) => i !== index);

        // Check if all cards drawn
        if (this.selectedSpread && this.drawnCards.length >= this.selectedSpread.cardCount) {
            setTimeout(() => {
                this.currentStep = 'loading';
                this.renderContent();
                this.getInterpretation();
            }, 300);
        } else {
            this.renderContent();
        }
    }


    private renderLoading() {
        const content = document.createElement('div');
        content.style.textAlign = 'center';
        content.style.padding = '40px 20px';

        content.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px; animation: pulse 1.5s infinite;">🔮</div>
            <p style="color: ${this.COLORS.accentLight}; font-size: 14px; margin-bottom: 10px;">
                Đang đọc thông điệp từ các lá bài...
            </p>
            <p style="color: ${this.COLORS.textMuted}; font-size: 12px;">
                Vui lòng chờ trong giây lát
            </p>
        `;

        // Add pulse animation
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
            }
        `;
        content.appendChild(style);

        this.container.appendChild(content);
    }

    private async getInterpretation() {
        if (!this.selectedSpread) return;

        const request = {
            question: this.question,
            topic: this.selectedTopic || undefined,
            spread: this.selectedSpread.type,
            drawnCards: this.drawnCards.map(dc => ({
                cardId: dc.card.id,
                cardName: dc.card.name.vi,
                orientation: dc.orientation,
                positionName: dc.position.name.vi,
                meaning: dc.orientation === 'upright' 
                    ? dc.card.meanings.upright.vi 
                    : dc.card.meanings.reversed.vi
            }))
        };

        try {
            const result = await TarotService.getReading(request);

            if (result.success && result.interpretation) {
                this.interpretation = result.interpretation;
                if (result.remainingGold !== undefined) {
                    EventBus.emit('currency-updated', { gold: result.remainingGold });
                }
            } else {
                // Fallback interpretation
                console.error('Tarot API failed:', result.error);
                this.interpretation = this.getFallbackInterpretation();
            }
        } catch (error) {
            console.error('Tarot interpretation error:', error);
            this.interpretation = this.getFallbackInterpretation();
        }

        this.currentStep = 'result';
        this.renderContent();
    }

    private getFallbackInterpretation(): AIInterpretation {
        return {
            cardInterpretations: this.drawnCards.map(dc => ({
                cardId: dc.card.id,
                interpretation: `Lá ${dc.card.name.vi} (${dc.orientation === 'upright' ? 'xuôi' : 'ngược'}) ở vị trí "${dc.position.name.vi}" mang thông điệp: ${dc.orientation === 'upright' ? dc.card.meanings.upright.vi : dc.card.meanings.reversed.vi}`
            })),
            overallReading: `Với các lá bài ${this.drawnCards.map(dc => dc.card.name.vi).join(', ')}, vũ trụ đang gửi đến bạn thông điệp về sự chuyển đổi và cơ hội. Câu hỏi "${this.question}" của bạn đang được lắng nghe.`,
            advice: this.drawnCards.some(dc => dc.orientation === 'reversed')
                ? 'Một số lá bài ngược cho thấy có những thử thách cần vượt qua. Hãy kiên nhẫn và nhìn nhận vấn đề từ nhiều góc độ.'
                : 'Các lá bài xuôi cho thấy năng lượng tích cực đang ủng hộ bạn. Hãy tự tin tiến về phía trước.'
        };
    }

    private renderResult() {
        const content = document.createElement('div');

        if (!this.interpretation) return;

        // Question recap
        const questionSection = document.createElement('div');
        Object.assign(questionSection.style, {
            backgroundColor: `${this.COLORS.cardBg}`,
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '15px',
            borderLeft: `3px solid ${this.COLORS.accent}`
        });
        questionSection.innerHTML = `
            <p style="color: ${this.COLORS.textMuted}; font-size: 11px; margin: 0 0 5px 0;">Câu hỏi của bạn:</p>
            <p style="color: ${this.COLORS.text}; font-size: 13px; margin: 0; font-style: italic;">"${this.question}"</p>
        `;
        content.appendChild(questionSection);

        // Drawn cards display
        const cardsSection = document.createElement('div');
        cardsSection.style.marginBottom = '20px';

        const cardsGrid = document.createElement('div');
        cardsGrid.style.display = 'flex';
        cardsGrid.style.justifyContent = 'center';
        cardsGrid.style.gap = '12px';
        cardsGrid.style.flexWrap = 'wrap';
        cardsGrid.style.marginBottom = '15px';

        this.drawnCards.forEach(drawn => {
            const cardDisplay = document.createElement('div');
            cardDisplay.style.textAlign = 'center';
            cardDisplay.style.cursor = 'pointer';
            cardDisplay.title = 'Nhấn để xem chi tiết';

            const cardVisual = document.createElement('div');
            Object.assign(cardVisual.style, {
                width: '55px',
                height: '82px',
                borderRadius: '6px',
                backgroundColor: this.COLORS.cardBg,
                border: `2px solid ${this.COLORS.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                margin: '0 auto 5px',
                transform: drawn.orientation === 'reversed' ? 'rotate(180deg)' : 'none',
                overflow: 'hidden',
                transition: 'all 0.2s ease'
            });
            
            // Use image if available
            if (drawn.card.image.startsWith('/')) {
                cardVisual.innerHTML = `<img src="${drawn.card.image}" style="width: 50px; height: auto; object-fit: contain;" alt="${drawn.card.name.vi}" />`;
            } else {
                cardVisual.innerHTML = drawn.card.image;
            }

            // Hover effect
            cardDisplay.onmouseenter = () => {
                cardVisual.style.transform = `${drawn.orientation === 'reversed' ? 'rotate(180deg)' : ''} scale(1.1)`;
                cardVisual.style.boxShadow = `0 4px 15px rgba(233, 30, 99, 0.5)`;
            };
            cardDisplay.onmouseleave = () => {
                cardVisual.style.transform = drawn.orientation === 'reversed' ? 'rotate(180deg)' : 'none';
                cardVisual.style.boxShadow = 'none';
            };

            // Click to show overlay
            cardDisplay.onclick = (e) => {
                e.stopPropagation();
                this.showCardOverlay(drawn);
            };

            const cardName = document.createElement('p');
            cardName.style.fontSize = '10px';
            cardName.style.color = this.COLORS.text;
            cardName.style.margin = '0';
            cardName.innerText = drawn.card.name.vi;

            const posName = document.createElement('p');
            posName.style.fontSize = '9px';
            posName.style.color = this.COLORS.textMuted;
            posName.style.margin = '2px 0 0 0';
            posName.innerText = drawn.position.name.vi;

            if (drawn.orientation === 'reversed') {
                const reversedBadge = document.createElement('span');
                reversedBadge.style.fontSize = '8px';
                reversedBadge.style.color = '#ff6b6b';
                reversedBadge.innerText = ' (Ngược)';
                cardName.appendChild(reversedBadge);
            }

            cardDisplay.appendChild(cardVisual);
            cardDisplay.appendChild(cardName);
            cardDisplay.appendChild(posName);
            cardsGrid.appendChild(cardDisplay);
        });

        cardsSection.appendChild(cardsGrid);
        
        // Hint text
        const hintText = document.createElement('p');
        hintText.style.textAlign = 'center';
        hintText.style.color = this.COLORS.textMuted;
        hintText.style.fontSize = '10px';
        hintText.style.margin = '0';
        hintText.innerHTML = '👆 Nhấn vào lá bài để xem chi tiết';
        cardsSection.appendChild(hintText);
        
        content.appendChild(cardsSection);

        // Card interpretations
        const interpSection = document.createElement('div');
        interpSection.style.marginBottom = '15px';

        const interpTitle = document.createElement('h4');
        interpTitle.innerText = '📖 Giải nghĩa từng lá';
        interpTitle.style.color = this.COLORS.accentLight;
        interpTitle.style.fontSize = '13px';
        interpTitle.style.marginBottom = '10px';
        interpSection.appendChild(interpTitle);

        this.interpretation.cardInterpretations.forEach((interp, idx) => {
            const drawn = this.drawnCards[idx];
            const interpCard = document.createElement('div');
            Object.assign(interpCard.style, {
                backgroundColor: this.COLORS.cardBg,
                borderRadius: '6px',
                padding: '10px',
                marginBottom: '8px',
                borderLeft: `3px solid ${this.COLORS.accent}`
            });
            
            // Render card image or emoji
            const cardImageHtml = drawn?.card.image.startsWith('/') 
                ? `<img src="${drawn.card.image}" style="width: 20px; height: auto; vertical-align: middle; margin-right: 5px;" alt="${drawn.card.name.vi}" />`
                : drawn?.card.image || '';
            
            interpCard.innerHTML = `
                <p style="color: ${this.COLORS.accent}; font-size: 12px; font-weight: bold; margin: 0 0 5px 0; display: flex; align-items: center;">
                    ${cardImageHtml} ${drawn?.card.name.vi}
                </p>
                <p style="color: ${this.COLORS.text}; font-size: 12px; line-height: 1.5; margin: 0;">
                    ${interp.interpretation}
                </p>
            `;
            interpSection.appendChild(interpCard);
        });

        content.appendChild(interpSection);

        // Overall reading
        const overallSection = document.createElement('div');
        Object.assign(overallSection.style, {
            background: `linear-gradient(135deg, ${this.COLORS.accent}22 0%, ${this.COLORS.cardBg} 100%)`,
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '15px',
            border: `1px solid ${this.COLORS.accent}44`
        });
        overallSection.innerHTML = `
            <h4 style="color: ${this.COLORS.accentLight}; font-size: 13px; margin: 0 0 10px 0;">🌟 Tổng quan</h4>
            <p style="color: ${this.COLORS.text}; font-size: 12px; line-height: 1.6; margin: 0;">
                ${this.interpretation.overallReading}
            </p>
        `;
        content.appendChild(overallSection);

        // Advice
        const adviceSection = document.createElement('div');
        Object.assign(adviceSection.style, {
            backgroundColor: this.COLORS.cardBg,
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px'
        });
        adviceSection.innerHTML = `
            <h4 style="color: #FFD700; font-size: 13px; margin: 0 0 10px 0;">💫 Lời khuyên</h4>
            <p style="color: ${this.COLORS.text}; font-size: 12px; line-height: 1.6; margin: 0; font-style: italic;">
                ${this.interpretation.advice}
            </p>
        `;
        content.appendChild(adviceSection);

        // Buttons
        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '10px';

        const readAgainBtn = this.createButton('Xem lại', this.COLORS.cardBorder, () => {
            this.reset();
            this.renderContent();
        });
        readAgainBtn.style.flex = '1';

        const closeBtn = this.createButton('Đóng', this.COLORS.accent, () => this.hide());
        closeBtn.style.flex = '1';

        btnGroup.appendChild(readAgainBtn);
        btnGroup.appendChild(closeBtn);
        content.appendChild(btnGroup);

        this.container.appendChild(content);
    }

    private createButton(text: string, bgColor: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerText = text;
        Object.assign(btn.style, {
            padding: '12px 20px',
            backgroundColor: bgColor,
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '13px',
            transition: 'all 0.2s'
        });
        btn.onmouseenter = () => { btn.style.opacity = '0.9'; };
        btn.onmouseleave = () => { btn.style.opacity = '1'; };
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
            this.hideCardOverlay();
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
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.backdrop && this.backdrop.parentNode) {
            this.backdrop.parentNode.removeChild(this.backdrop);
        }
        if (this.cardOverlay && this.cardOverlay.parentNode) {
            this.cardOverlay.parentNode.removeChild(this.cardOverlay);
        }
    }
}
