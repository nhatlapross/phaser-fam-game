import { Scene } from "phaser";
import { PetChatService } from "../PetChatService";

type ChatStep = "chat" | "loading" | "response";

interface ChatMessage {
    role: "user" | "pet";
    content: string;
    timestamp: number;
}

export class PetChatModal {
    private scene: Scene;
    private container: HTMLDivElement;
    private backdrop: HTMLDivElement | null = null;
    private isVisible: boolean = false;
    public onClose?: () => void;

    // Pet info
    private petName: string = "CyberCat";
    private petType: string = "kungfu-master";
    private petEmoji: string = "🐱";

    // State
    private currentStep: ChatStep = "chat";
    private message: string = "";
    private response: string = "";
    private displayedResponse: string = "";
    private typingInterval: number | null = null;
    private chatHistory: ChatMessage[] = []; // Store conversation history

    // Styles (similar to DefiMaster but with pet theme)
    private readonly COLORS = {
        bg: "#1a0a28",
        bgGradient:
            "linear-gradient(135deg, #1a0a28 0%, #2d1a4a 50%, #1f0d35 100%)",
        border: "#ff00d4",
        accent: "#ff00d4",
        accentGlow: "rgba(255, 0, 212, 0.4)",
        gold: "#FFD700",
        text: "#ffe0f7",
        textMuted: "#c97eb8",
        cardBg: "#2d0d37",
        cardBorder: "#4a1a6e",
    };

    constructor(scene: Scene, petName: string, petType: string) {
        this.scene = scene;
        this.petName = petName;
        this.petType = petType;
        this.petEmoji = this.getPetEmoji(petType);
        this.createModal();
    }

    private getPetEmoji(petType: string): string {
        const emojiMap: { [key: string]: string } = {
            "kungfu-master": "🥋",
            cowboy: "🤠",
            explorer: "🧭",
            bullfighter: "🐂",
            "soccer-player": "⚽",
            ninja: "🥷",
            nurse: "👩‍⚕️",
            "npc-maidcat": "🐱",
        };
        return emojiMap[petType] || "🐱";
    }

    private reset() {
        this.currentStep = "chat";
        this.message = "";
        this.response = "";
        this.displayedResponse = "";
        this.chatHistory = []; // Clear history on reset
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
    }

    private createModal() {
        // Create backdrop
        this.backdrop = document.createElement("div");
        this.backdrop.id = "pet-chat-backdrop";
        Object.assign(this.backdrop.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(20, 0, 40, 0.7)",
            backdropFilter: "blur(4px)",
            display: "none",
            zIndex: "999",
        });
        this.backdrop.onclick = () => this.hide();
        document.body.appendChild(this.backdrop);

        // Create main container
        this.container = document.createElement("div");
        this.container.id = "pet-chat-modal";
        Object.assign(this.container.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "420px",
            maxWidth: "95vw",
            maxHeight: "90vh",
            background: this.COLORS.bgGradient,
            border: `2px solid ${this.COLORS.border}`,
            borderRadius: "16px",
            padding: "0",
            color: this.COLORS.text,
            fontFamily: "Arial, sans-serif",
            zIndex: "1000",
            display: "none",
            boxShadow: `0 0 40px ${this.COLORS.accentGlow}, inset 0 0 60px rgba(255, 0, 212, 0.05)`,
            overflow: "hidden",
            pointerEvents: "auto",
        });

        // Prevent event propagation
        [
            "wheel",
            "mousedown",
            "mouseup",
            "click",
            "touchstart",
            "touchend",
        ].forEach((evt) => {
            this.container.addEventListener(evt, (e) => e.stopPropagation());
        });

        // Add custom styles
        const style = document.createElement("style");
        style.innerHTML = `
            #pet-chat-modal::-webkit-scrollbar { display: none; }
            #pet-chat-modal { -ms-overflow-style: none; scrollbar-width: none; }
            @keyframes petPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(1.05); }
            }
            @keyframes petFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes petTyping {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `;
        this.container.appendChild(style);

        document.body.appendChild(this.container);
    }

    private renderContent() {
        const style = this.container.querySelector("style");
        this.container.innerHTML = "";
        if (style) this.container.appendChild(style);

        // Header
        const header = this.createHeader();
        this.container.appendChild(header);

        // Content wrapper
        const contentWrapper = document.createElement("div");
        contentWrapper.style.padding = "20px";
        contentWrapper.style.maxHeight = "calc(90vh - 100px)";
        contentWrapper.style.overflowY = "auto";

        switch (this.currentStep) {
            case "chat":
                this.renderChatStep(contentWrapper);
                break;
            case "loading":
                this.renderLoadingStep(contentWrapper);
                break;
        }

        this.container.appendChild(contentWrapper);
    }

    private createHeader(): HTMLElement {
        const header = document.createElement("div");
        Object.assign(header.style, {
            background:
                "linear-gradient(90deg, rgba(255,0,212,0.1) 0%, rgba(255,0,212,0.2) 50%, rgba(255,0,212,0.1) 100%)",
            borderBottom: `1px solid ${this.COLORS.cardBorder}`,
            padding: "15px 20px",
            position: "relative",
        });

        // Title
        const titleContainer = document.createElement("div");
        titleContainer.style.display = "flex";
        titleContainer.style.alignItems = "center";
        titleContainer.style.justifyContent = "center";
        titleContainer.style.gap = "12px";

        const icon = document.createElement("span");
        icon.innerHTML = this.petEmoji;
        icon.style.fontSize = "28px";
        icon.style.animation = "petFloat 2s ease-in-out infinite";

        const title = document.createElement("h2");
        title.innerHTML = this.petName;
        Object.assign(title.style, {
            color: this.COLORS.accent,
            margin: "0",
            fontSize: "22px",
            fontWeight: "bold",
            textShadow: `0 0 10px ${this.COLORS.accentGlow}`,
        });

        titleContainer.appendChild(icon);
        titleContainer.appendChild(title);
        header.appendChild(titleContainer);

        // Subtitle
        const subtitle = document.createElement("p");
        subtitle.innerText = "Your CyberCat companion";
        Object.assign(subtitle.style, {
            color: this.COLORS.textMuted,
            margin: "5px 0 0 0",
            fontSize: "12px",
            textAlign: "center",
        });
        header.appendChild(subtitle);

        // Close button
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        Object.assign(closeBtn.style, {
            position: "absolute",
            top: "10px",
            right: "15px",
            background: "none",
            border: "none",
            color: this.COLORS.textMuted,
            fontSize: "20px",
            cursor: "pointer",
            padding: "5px",
        });
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        return header;
    }

    private renderChatStep(container: HTMLElement) {
        // Chat history section (if exists)
        if (this.chatHistory.length > 0) {
            const historySection = document.createElement("div");
            Object.assign(historySection.style, {
                marginBottom: "20px",
                maxHeight: "250px",
                overflowY: "auto",
                padding: "10px",
                background: this.COLORS.cardBg,
                borderRadius: "10px",
                border: `1px solid ${this.COLORS.cardBorder}`,
            });

            this.chatHistory.forEach((msg) => {
                const msgDiv = document.createElement("div");
                Object.assign(msgDiv.style, {
                    marginBottom: "12px",
                    padding: "10px",
                    borderRadius: "8px",
                    background:
                        msg.role === "user"
                            ? "rgba(255,0,212,0.1)"
                            : "rgba(255,0,212,0.05)",
                    borderLeft:
                        msg.role === "user"
                            ? `3px solid ${this.COLORS.accent}`
                            : `3px solid ${this.COLORS.cardBorder}`,
                });

                const header = document.createElement("div");
                header.style.marginBottom = "5px";
                header.innerHTML =
                    msg.role === "user"
                        ? `<span style="color: ${this.COLORS.accent}; font-size: 12px; font-weight: bold;">You:</span>`
                        : `<span style="color: ${this.COLORS.accent}; font-size: 12px; font-weight: bold;">${this.petEmoji} ${this.petName}:</span>`;
                msgDiv.appendChild(header);

                const content = document.createElement("div");
                content.style.color = this.COLORS.text;
                content.style.fontSize = "13px";
                content.style.lineHeight = "1.6";
                content.style.whiteSpace = "pre-wrap";
                content.textContent = msg.content;
                msgDiv.appendChild(content);

                historySection.appendChild(msgDiv);
            });

            // Auto scroll to bottom
            setTimeout(() => {
                historySection.scrollTop = historySection.scrollHeight;
            }, 0);

            container.appendChild(historySection);
        }

        // Message input
        const messageSection = document.createElement("div");
        messageSection.style.marginBottom = "20px";

        const messageLabel = document.createElement("p");
        messageLabel.innerText =
            this.chatHistory.length > 0
                ? "💬 Continue chatting:"
                : "💬 Chat with your pet:";
        Object.assign(messageLabel.style, {
            color: this.COLORS.accent,
            fontSize: "13px",
            marginBottom: "10px",
        });
        messageSection.appendChild(messageLabel);

        const textarea = document.createElement("textarea");
        textarea.value = this.message;
        textarea.placeholder =
            this.chatHistory.length > 0
                ? "Say something else..."
                : "Say hi to your pet! Ask about games, tricks, or just chat...";
        Object.assign(textarea.style, {
            width: "100%",
            height: "100px",
            padding: "12px",
            background: this.COLORS.cardBg,
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: "10px",
            color: this.COLORS.text,
            fontSize: "14px",
            resize: "none",
            boxSizing: "border-box",
            outline: "none",
        });
        textarea.oninput = (e) => {
            this.message = (e.target as HTMLTextAreaElement).value;
        };
        textarea.addEventListener("keydown", (e) => e.stopPropagation());
        textarea.addEventListener("keyup", (e) => e.stopPropagation());
        messageSection.appendChild(textarea);
        container.appendChild(messageSection);

        // Buttons
        const btnGroup = document.createElement("div");
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "10px";
        btnGroup.style.marginBottom = "10px";

        const sendBtn = this.createButton(
            "💌 Send",
            this.COLORS.accent,
            async () => {
                if (!this.message.trim()) {
                    alert("Please type a message!");
                    return;
                }
                this.currentStep = "loading";
                this.renderContent();
                await this.sendMessageToAPI();
            },
        );
        sendBtn.style.flex = "1";
        btnGroup.appendChild(sendBtn);

        // Show "New Session" button if there's history
        if (this.chatHistory.length > 0) {
            const newSessionBtn = this.createButton(
                "🔄 New Session",
                this.COLORS.cardBorder,
                () => {
                    this.reset();
                    this.renderContent();
                },
            );
            newSessionBtn.style.flex = "1";
            btnGroup.appendChild(newSessionBtn);
        }

        container.appendChild(btnGroup);

        // Close button
        const closeBtn = this.createButton(
            "Close",
            this.COLORS.cardBorder,
            () => this.hide(),
        );
        closeBtn.style.width = "100%";
        container.appendChild(closeBtn);
    }

    private renderLoadingStep(container: HTMLElement) {
        const loadingContainer = document.createElement("div");
        Object.assign(loadingContainer.style, {
            textAlign: "center",
            padding: "40px 20px",
        });

        const icon = document.createElement("div");
        icon.innerHTML = this.petEmoji;
        Object.assign(icon.style, {
            fontSize: "60px",
            marginBottom: "20px",
            animation: "petPulse 1.5s ease-in-out infinite",
        });
        loadingContainer.appendChild(icon);

        const loadingText = document.createElement("p");
        loadingText.innerHTML = `${this.petName} is thinking...`;
        Object.assign(loadingText.style, {
            color: this.COLORS.accent,
            fontSize: "16px",
        });
        loadingContainer.appendChild(loadingText);

        container.appendChild(loadingContainer);
    }

    private renderResponseStep(container: HTMLElement) {
        // Message recap
        const messageRecap = document.createElement("div");
        Object.assign(messageRecap.style, {
            background: this.COLORS.cardBg,
            borderRadius: "10px",
            padding: "12px 15px",
            marginBottom: "15px",
            borderLeft: `3px solid ${this.COLORS.accent}`,
        });
        messageRecap.innerHTML = `
            <p style="color: ${this.COLORS.textMuted}; font-size: 11px; margin: 0 0 5px 0;">You said:</p>
            <p style="color: ${this.COLORS.text}; font-size: 13px; margin: 0; font-style: italic;">"${this.message}"</p>
        `;
        container.appendChild(messageRecap);

        // Response section
        const responseSection = document.createElement("div");
        Object.assign(responseSection.style, {
            background:
                "linear-gradient(135deg, rgba(255,0,212,0.05) 0%, rgba(255,0,212,0.02) 100%)",
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
            maxHeight: "250px",
            overflowY: "auto",
        });

        const responseHeader = document.createElement("div");
        responseHeader.style.display = "flex";
        responseHeader.style.alignItems = "center";
        responseHeader.style.gap = "10px";
        responseHeader.style.marginBottom = "15px";
        responseHeader.innerHTML = `
            <span style="font-size: 24px;">${this.petEmoji}</span>
            <span style="color: ${this.COLORS.accent}; font-size: 14px; font-weight: bold;">${this.petName} says:</span>
        `;
        responseSection.appendChild(responseHeader);

        const responseText = document.createElement("div");
        Object.assign(responseText.style, {
            color: this.COLORS.text,
            fontSize: "14px",
            lineHeight: "1.8",
            whiteSpace: "pre-wrap",
        });
        responseText.innerHTML = this.displayedResponse;

        if (this.displayedResponse.length < this.response.length) {
            const cursor = document.createElement("span");
            cursor.innerHTML = "▋";
            cursor.style.animation = "petTyping 0.5s infinite";
            cursor.style.color = this.COLORS.accent;
            responseText.appendChild(cursor);
        }

        responseSection.appendChild(responseText);
        container.appendChild(responseSection);

        // Continue chat input
        const continueSection = document.createElement("div");
        continueSection.style.marginBottom = "15px";

        const continueLabel = document.createElement("p");
        continueLabel.innerText = "💬 Continue chatting:";
        Object.assign(continueLabel.style, {
            color: this.COLORS.accent,
            fontSize: "13px",
            marginBottom: "10px",
        });
        continueSection.appendChild(continueLabel);

        const textarea = document.createElement("textarea");
        textarea.value = "";
        textarea.placeholder = "Say something else...";
        Object.assign(textarea.style, {
            width: "100%",
            height: "80px",
            padding: "12px",
            background: this.COLORS.cardBg,
            border: `1px solid ${this.COLORS.cardBorder}`,
            borderRadius: "10px",
            color: this.COLORS.text,
            fontSize: "14px",
            resize: "none",
            boxSizing: "border-box",
            outline: "none",
        });
        textarea.addEventListener("keydown", (e) => e.stopPropagation());
        textarea.addEventListener("keyup", (e) => e.stopPropagation());
        continueSection.appendChild(textarea);
        container.appendChild(continueSection);

        // Buttons
        const btnGroup = document.createElement("div");
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "10px";

        const sendBtn = this.createButton(
            "💌 Send",
            this.COLORS.accent,
            async () => {
                const newMessage = textarea.value.trim();
                if (!newMessage) {
                    alert("Please type a message!");
                    return;
                }
                this.message = newMessage;
                this.currentStep = "loading";
                this.renderContent();
                await this.sendMessageToAPI();
            },
        );
        sendBtn.style.flex = "1";

        const closeBtn = this.createButton(
            "✓ Close",
            this.COLORS.cardBorder,
            () => this.hide(),
        );
        closeBtn.style.flex = "1";

        btnGroup.appendChild(sendBtn);
        btnGroup.appendChild(closeBtn);
        container.appendChild(btnGroup);
    }

    private async sendMessageToAPI() {
        console.log("🐱 PetChat: Sending message to API...", {
            message: this.message,
            petType: this.petType,
            petName: this.petName,
        });

        // Add user message to history
        this.chatHistory.push({
            role: "user",
            content: this.message,
            timestamp: Date.now(),
        });

        try {
            const result = await PetChatService.sendMessage({
                message: this.message,
                petType: this.petType,
                petName: this.petName,
            });

            console.log("🐱 PetChat: API response:", result);

            if (result.success && result.content) {
                this.response = result.content;

                // Add pet response to history
                this.chatHistory.push({
                    role: "pet",
                    content: result.content,
                    timestamp: Date.now(),
                });

                // Clear message input and go back to chat step
                this.message = "";
                this.currentStep = "chat";
                this.renderContent();
            } else {
                console.error("🐱 PetChat: API error:", result.error);
                this.response =
                    result.error || "Oops! Something went wrong. Try again!";

                // Add error response to history
                this.chatHistory.push({
                    role: "pet",
                    content: this.response,
                    timestamp: Date.now(),
                });

                this.message = "";
                this.currentStep = "chat";
                this.renderContent();
            }
        } catch (error) {
            console.error("🐱 PetChat error:", error);
            this.response =
                "Cannot connect to your pet right now. Please try again later!";

            // Add error response to history
            this.chatHistory.push({
                role: "pet",
                content: this.response,
                timestamp: Date.now(),
            });

            this.message = "";
            this.currentStep = "chat";
            this.renderContent();
        }
    }

    private simulateResponse() {
        // Fallback simulated response (kept for offline mode)
        setTimeout(() => {
            const responses = [
                `Meow! 🐱 I'm ${this.petName}, your loyal companion! I love playing games and exploring the cyber world with you!`,
                `Purr~ 😺 Thanks for chatting with me! Want to play a mini-game together?`,
                `*stretches* 🐾 I've been waiting for you! Let's have some fun in the Pet Farm!`,
                `Nya~ 💕 You're the best owner ever! I'm so happy to be your CyberCat!`,
                `*wags tail* 🎮 I heard there are cool games here! Wanna try them together?`,
            ];
            this.response =
                responses[Math.floor(Math.random() * responses.length)];
            this.displayedResponse = "";
            this.currentStep = "response";
            this.renderContent();
            this.startTypingEffect();
        }, 1500);
    }

    private startTypingEffect() {
        const charsPerTick = 2;
        const tickInterval = 30;

        this.typingInterval = window.setInterval(() => {
            if (this.displayedResponse.length < this.response.length) {
                this.displayedResponse = this.response.substring(
                    0,
                    this.displayedResponse.length + charsPerTick,
                );

                const responseText = this.container.querySelector(
                    'div[style*="line-height: 1.8"]',
                );
                if (responseText) {
                    responseText.innerHTML = this.displayedResponse;

                    if (this.displayedResponse.length < this.response.length) {
                        const cursor = document.createElement("span");
                        cursor.innerHTML = "▋";
                        cursor.style.animation = "petTyping 0.5s infinite";
                        cursor.style.color = this.COLORS.accent;
                        responseText.appendChild(cursor);
                    }
                }
            } else {
                if (this.typingInterval) {
                    clearInterval(this.typingInterval);
                    this.typingInterval = null;
                }
            }
        }, tickInterval);
    }

    private createButton(
        text: string,
        bgColor: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.innerText = text;
        Object.assign(btn.style, {
            padding: "12px 20px",
            background:
                bgColor === this.COLORS.accent
                    ? `linear-gradient(135deg, ${this.COLORS.accent} 0%, #cc0099 100%)`
                    : bgColor,
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "14px",
            transition: "all 0.2s",
        });
        btn.onclick = onClick;
        return btn;
    }

    public show() {
        if (!this.isVisible) {
            this.reset();
            if (this.backdrop) {
                this.backdrop.style.display = "block";
            }
            this.container.style.display = "block";
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
                this.backdrop.style.display = "none";
            }
            this.container.style.display = "none";
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

