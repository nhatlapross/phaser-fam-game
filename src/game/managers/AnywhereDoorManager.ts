import { Scene } from "phaser";
import { AnywhereDoorService, BridgeRequest } from "../AnywhereDoorService";
import { UserService } from "../UserService";

export class AnywhereDoorManager {
    private scene: Scene;
    private service: AnywhereDoorService;
    private modal: Phaser.GameObjects.Container | null = null;

    private readonly CHAINS = [
        { id: "421614", name: "Arbitrum Sepolia", icon: "🔵" },
        { id: "84532", name: "Base Sepolia", icon: "🔷" },
        { id: "11155111", name: "Ethereum Sepolia", icon: "💎" },
        { id: "80002", name: "Polygon Amoy", icon: "🟣" },
    ];

    constructor(scene: Scene) {
        this.scene = scene;
        this.service = AnywhereDoorService.getInstance();
    }

    open() {
        if (this.modal) return;
        this.createModal();
    }

    close() {
        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
    }

    private createModal() {
        const W = 380;
        const H = 500;
        const X = this.scene.scale.width / 2;
        const Y = this.scene.scale.height / 2;

        this.modal = this.scene.add.container(0, 0);
        const elements: Phaser.GameObjects.GameObject[] = [];

        // Overlay
        const overlay = this.scene.add.rectangle(
            X,
            Y,
            this.scene.scale.width,
            this.scene.scale.height,
            0x000000,
            0.8,
        );
        overlay.setScrollFactor(0).setDepth(5000).setInteractive();
        elements.push(overlay);

        // Background
        const bg = this.scene.add.rectangle(X, Y, W, H, 0x2c1810);
        bg.setStrokeStyle(4, 0xffd700).setScrollFactor(0).setDepth(5001);
        elements.push(bg);

        const innerBorder = this.scene.add.rectangle(
            X,
            Y,
            W - 20,
            H - 20,
            0x000000,
            0,
        );
        innerBorder
            .setStrokeStyle(2, 0xff9800)
            .setScrollFactor(0)
            .setDepth(5001);
        elements.push(innerBorder);

        // Corners
        [
            [X - W / 2 + 15, Y - H / 2 + 15],
            [X + W / 2 - 15, Y - H / 2 + 15],
            [X - W / 2 + 15, Y + H / 2 - 15],
            [X + W / 2 - 15, Y + H / 2 - 15],
        ].forEach(([cx, cy]) => {
            const g = this.scene.add.graphics();
            g.fillStyle(0xffd700, 1);
            g.fillCircle(cx, cy, 8);
            g.setScrollFactor(0).setDepth(5003);
            elements.push(g);
        });

        // Close button
        const closeBtn = this.scene.add.circle(
            X + W / 2 - 25,
            Y - H / 2 + 25,
            15,
            0xff4444,
        );
        closeBtn
            .setStrokeStyle(2, 0xffffff)
            .setScrollFactor(0)
            .setDepth(5002)
            .setInteractive({ useHandCursor: true });
        const closeText = this.scene.add
            .text(X + W / 2 - 25, Y - H / 2 + 25, "X", {
                fontSize: "16px",
                fontFamily: "PixelFont",
                color: "#FFF",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5003)
            .setScrollFactor(0)
            .setStroke("#000", 3);

        closeBtn.on("pointerdown", () => this.close());
        closeBtn.on("pointerover", () => {
            closeBtn.setFillStyle(0xff6666);
            closeBtn.setScale(1.1);
        });
        closeBtn.on("pointerout", () => {
            closeBtn.setFillStyle(0xff4444);
            closeBtn.setScale(1.0);
        });
        elements.push(closeBtn, closeText);

        // Title
        const title = this.scene.add
            .text(X, Y - H / 2 + 45, "✨ ANYWHERE DOOR ✨", {
                fontSize: "24px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5002)
            .setScrollFactor(0)
            .setStroke("#8B4513", 4);
        elements.push(title);

        const subtitle = this.scene.add
            .text(X, Y - H / 2 + 75, "Cross-Chain Bridge", {
                fontSize: "12px",
                fontFamily: "PixelFont",
                color: "#FFA500",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5002)
            .setScrollFactor(0);
        elements.push(subtitle);

        // From Chain
        const fromLabel = this.scene.add
            .text(X, Y - 160, "FROM CHAIN:", {
                fontSize: "14px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5002)
            .setScrollFactor(0);
        elements.push(fromLabel);

        let selectedSource = this.CHAINS[0].id;
        const sourceBtns: Phaser.GameObjects.Rectangle[] = [];

        this.CHAINS.forEach((chain, i) => {
            const bx = X - 75 + (i % 2) * 150;
            const by = Y - 120 + Math.floor(i / 2) * 45;

            const btn = this.scene.add.rectangle(bx, by, 140, 38, 0x8b4513);
            btn.setStrokeStyle(3, i === 0 ? 0xffd700 : 0x654321);
            btn.setScrollFactor(0)
                .setDepth(5002)
                .setInteractive({ useHandCursor: true });

            const txt = this.scene.add
                .text(bx, by, `${chain.icon} ${chain.name}`, {
                    fontSize: "10px",
                    fontFamily: "PixelFont",
                    color: "#fff",
                    resolution: 2,
                })
                .setOrigin(0.5)
                .setDepth(5003)
                .setScrollFactor(0);

            btn.on("pointerdown", () => {
                selectedSource = chain.id;
                sourceBtns.forEach((b, j) =>
                    b.setStrokeStyle(3, j === i ? 0xffd700 : 0x654321),
                );
            });
            btn.on("pointerover", () => btn.setFillStyle(0xa0522d));
            btn.on("pointerout", () => btn.setFillStyle(0x8b4513));

            sourceBtns.push(btn);
            elements.push(btn, txt);
        });

        // To Chain
        const toLabel = this.scene.add
            .text(X, Y - 25, "TO CHAIN:", {
                fontSize: "14px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5002)
            .setScrollFactor(0);
        elements.push(toLabel);

        let selectedDest = this.CHAINS[1].id;
        const destBtns: Phaser.GameObjects.Rectangle[] = [];

        this.CHAINS.forEach((chain, i) => {
            const bx = X - 75 + (i % 2) * 150;
            const by = Y + 15 + Math.floor(i / 2) * 45;

            const btn = this.scene.add.rectangle(bx, by, 140, 38, 0x8b4513);
            btn.setStrokeStyle(3, i === 1 ? 0xffd700 : 0x654321);
            btn.setScrollFactor(0)
                .setDepth(5002)
                .setInteractive({ useHandCursor: true });

            const txt = this.scene.add
                .text(bx, by, `${chain.icon} ${chain.name}`, {
                    fontSize: "10px",
                    fontFamily: "PixelFont",
                    color: "#fff",
                    resolution: 2,
                })
                .setOrigin(0.5)
                .setDepth(5003)
                .setScrollFactor(0);

            btn.on("pointerdown", () => {
                selectedDest = chain.id;
                destBtns.forEach((b, j) =>
                    b.setStrokeStyle(3, j === i ? 0xffd700 : 0x654321),
                );
            });
            btn.on("pointerover", () => btn.setFillStyle(0xa0522d));
            btn.on("pointerout", () => btn.setFillStyle(0x8b4513));

            destBtns.push(btn);
            elements.push(btn, txt);
        });

        // Amount
        const amtLabel = this.scene.add
            .text(X, Y + 100, "AMOUNT (ETH):", {
                fontSize: "14px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5002)
            .setScrollFactor(0);
        elements.push(amtLabel);

        // HTML Input - Fixed position
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "0.1";
        input.value = "0.1";
        input.style.position = "fixed";
        const canvas = this.scene.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const inputW = 340;
        const inputH = 45;
        input.style.left = `${rect.left + rect.width / 2 - inputW / 2}px`;
        input.style.top = `${rect.top + rect.height / 2 + 145}px`;
        input.style.width = `${inputW}px`;
        input.style.height = `${inputH}px`;
        input.style.fontSize = "18px";
        input.style.fontFamily = "PixelFont, Arial";
        input.style.padding = "5px 12px";
        input.style.border = "3px solid #8B4513";
        input.style.borderRadius = "8px";
        input.style.backgroundColor = "#34495e";
        input.style.color = "#FFD700";
        input.style.outline = "none";
        input.style.zIndex = "999999";
        input.style.textAlign = "center";
        document.body.appendChild(input);

        // Bridge Button
        const btnY = Y + H / 2 - 55;
        const shadow = this.scene.add.rectangle(
            X + 3,
            btnY + 3,
            220,
            50,
            0x000000,
            0.4,
        );
        shadow.setScrollFactor(0).setDepth(5002);
        elements.push(shadow);

        const bridgeBtn = this.scene.add.rectangle(X, btnY, 220, 50, 0x4caf50);
        bridgeBtn
            .setStrokeStyle(4, 0x66bb6a)
            .setScrollFactor(0)
            .setDepth(5002)
            .setInteractive({ useHandCursor: true });

        const btnText = this.scene.add
            .text(X, btnY, "BRIDGE NOW!", {
                fontSize: "16px",
                fontFamily: "PixelFont",
                color: "#FFF",
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(5003)
            .setScrollFactor(0)
            .setStroke("#000", 4);

        elements.push(bridgeBtn, btnText);

        // Pulsing
        this.scene.tweens.add({
            targets: [bridgeBtn, btnText, shadow],
            scale: 1.05,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        bridgeBtn.on("pointerover", () => bridgeBtn.setFillStyle(0x66bb6a));
        bridgeBtn.on("pointerout", () => bridgeBtn.setFillStyle(0x4caf50));
        bridgeBtn.on("pointerdown", async () => {
            const amt = input.value.trim();
            if (!amt || parseFloat(amt) <= 0) {
                this.showToast("❌ Invalid amount", 0xe74c3c);
                return;
            }
            if (selectedSource === selectedDest) {
                this.showToast(
                    "❌ Source and destination must be different",
                    0xe74c3c,
                );
                return;
            }
            const user = UserService.getStoredUser();
            if (!user?.walletAddress) {
                this.showToast("❌ Wallet not connected", 0xe74c3c);
                return;
            }

            const req: BridgeRequest = {
                sourceChain: selectedSource,
                destChain: selectedDest,
                token: this.service.NATIVE_TOKEN_ADDRESS,
                amount: this.service.ethToWei(amt),
                userAddress: user.walletAddress,
            };

            this.showToast("⏳ Processing bridge...", 0xffa500);
            const result = await this.service.triggerBridge(req);

            if (result.success) {
                this.showToast("✅ Bridge initiated!", 0x4caf50);
                this.close();
            } else {
                this.showToast(`❌ ${result.message}`, 0xe74c3c);
            }
        });

        this.modal.add(elements);
        (this.modal as any).inputElement = input;
        this.modal.on("destroy", () => {
            if (input.parentNode) input.remove();
        });
        this.scene.cameras.main.ignore(this.modal.list);
    }

    private showToast(text: string, color: number) {
        const toast = this.scene.add
            .text(
                this.scene.scale.width / 2,
                this.scene.scale.height - 80,
                text,
                {
                    fontSize: "18px",
                    fontFamily: "PixelFont",
                    color: "#fff",
                    backgroundColor: `#${color.toString(16)}`,
                    padding: { x: 20, y: 12 },
                    resolution: 2,
                },
            )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(10000);

        this.scene.tweens.add({
            targets: toast,
            alpha: 0,
            y: this.scene.scale.height - 150,
            duration: 3000,
            onComplete: () => toast.destroy(),
        });
    }
}

