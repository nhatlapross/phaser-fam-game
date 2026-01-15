import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

interface ConnectionData {
    username: string;
    address: string;
    guild: string;
    treeCount: number;
    timestamp: number;
    doubleHandshake: boolean;
}

export class Networking extends Scene {
    private waterRemaining: number = 15;
    private maxWater: number = 20;
    private todayConnections: number = 0;
    private connections: ConnectionData[] = [];
    private scannerActive: boolean = false;
    private historyContainer!: Phaser.GameObjects.Container;
    private myQRContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('Networking');
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor(0xF8F9FA);

        // Create header
        this.createHeader();

        // Create scanner area
        this.createScanner();

        // Create stats display
        this.createStats();

        // Create my QR code section
        this.createMyQR();

        // Create history section
        this.createHistory();

        // Initialize sample data
        this.initializeSampleData();

        EventBus.emit('current-scene-ready', this);
    }

    private createHeader() {
        // Header background
        const headerBg = this.add.rectangle(0, 0, this.scale.width, 80, 0x2196F3);
        headerBg.setOrigin(0, 0);

        // Back button
        const backBtn = this.add.text(20, 25, '← Social Watering', {
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.scene.start('HomeGarden');
        });

        // History button
        const historyBtn = this.add.text(this.scale.width - 120, 25, 'HISTORY', {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setInteractive({ useHandCursor: true });

        historyBtn.on('pointerdown', () => {
            this.toggleHistory();
        });
    }

    private createScanner() {
        const scannerY = 120;

        // Scanner container
        const scannerBg = this.add.rectangle(
            this.scale.width / 2,
            scannerY + 200,
            this.scale.width - 80,
            400,
            0x263238
        );
        scannerBg.setStrokeStyle(4, 0x2196F3);

        // Scanner overlay effect
        const scanLine = this.add.rectangle(
            this.scale.width / 2,
            scannerY + 50,
            this.scale.width - 100,
            3,
            0x00FF00,
            0.8
        );

        // Animated scan line
        this.tweens.add({
            targets: scanLine,
            y: scannerY + 350,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Linear'
        });

        // Scanner icon/text
        const scannerIcon = this.add.text(
            this.scale.width / 2,
            scannerY + 150,
            '📱',
            { fontSize: '64px' }
        );
        scannerIcon.setOrigin(0.5);

        const scannerText = this.add.text(
            this.scale.width / 2,
            scannerY + 230,
            'Point camera at QR code\nto water their tree',
            {
                fontSize: '20px',
                color: '#ffffff',
                align: 'center',
                lineSpacing: 10
            }
        );
        scannerText.setOrigin(0.5);

        // Simulated QR detection area
        const qrArea = this.add.rectangle(
            this.scale.width / 2,
            scannerY + 150,
            200,
            200,
            0x4CAF50,
            0
        );
        qrArea.setStrokeStyle(3, 0x4CAF50);

        // Corner brackets for QR detection
        const brackets = this.add.graphics();
        brackets.lineStyle(4, 0x4CAF50, 1);

        const corners = [
            { x: this.scale.width / 2 - 100, y: scannerY + 50 },
            { x: this.scale.width / 2 + 100, y: scannerY + 50 },
            { x: this.scale.width / 2 - 100, y: scannerY + 250 },
            { x: this.scale.width / 2 + 100, y: scannerY + 250 }
        ];

        const bracketSize = 20;
        // Top-left
        brackets.lineBetween(corners[0].x, corners[0].y, corners[0].x + bracketSize, corners[0].y);
        brackets.lineBetween(corners[0].x, corners[0].y, corners[0].x, corners[0].y + bracketSize);

        // Top-right
        brackets.lineBetween(corners[1].x, corners[1].y, corners[1].x - bracketSize, corners[1].y);
        brackets.lineBetween(corners[1].x, corners[1].y, corners[1].x, corners[1].y + bracketSize);

        // Bottom-left
        brackets.lineBetween(corners[2].x, corners[2].y, corners[2].x + bracketSize, corners[2].y);
        brackets.lineBetween(corners[2].x, corners[2].y, corners[2].x, corners[2].y - bracketSize);

        // Bottom-right
        brackets.lineBetween(corners[3].x, corners[3].y, corners[3].x - bracketSize, corners[3].y);
        brackets.lineBetween(corners[3].x, corners[3].y, corners[3].x, corners[3].y - bracketSize);

        // Simulate scan button (for demo)
        const scanBtn = this.add.rectangle(
            this.scale.width / 2,
            scannerY + 330,
            200,
            50,
            0x4CAF50
        );
        scanBtn.setInteractive({ useHandCursor: true });

        const scanBtnText = this.add.text(
            this.scale.width / 2,
            scannerY + 330,
            'SIMULATE SCAN',
            {
                fontSize: '16px',
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        scanBtnText.setOrigin(0.5);

        scanBtn.on('pointerdown', () => {
            this.simulateScan();
        });

        // Hover effect
        scanBtn.on('pointerover', () => {
            this.tweens.add({
                targets: scanBtn,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 100
            });
        });

        scanBtn.on('pointerout', () => {
            this.tweens.add({
                targets: scanBtn,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });
        });
    }

    private createStats() {
        const statsY = 550;

        // Stats background
        const statsBg = this.add.rectangle(
            this.scale.width / 2,
            statsY,
            this.scale.width - 80,
            80,
            0xFFFFFF
        );
        statsBg.setStrokeStyle(2, 0xE0E0E0);

        // Water remaining
        const waterText = this.add.text(
            60,
            statsY - 15,
            `💧 Water Remaining: ${this.waterRemaining}/${this.maxWater}`,
            {
                fontSize: '18px',
                color: '#2196F3',
                fontStyle: 'bold'
            }
        );

        // Today's connections
        const connectionsText = this.add.text(
            60,
            statsY + 15,
            `🌊 Today's Connections: ${this.todayConnections}`,
            {
                fontSize: '18px',
                color: '#4CAF50',
                fontStyle: 'bold'
            }
        );
    }

    private createMyQR() {
        this.myQRContainer = this.add.container(0, 650);

        // Section title
        const title = this.add.text(40, 0, '👤 MY QR CODE', {
            fontSize: '20px',
            color: '#2C3E50',
            fontStyle: 'bold'
        });
        this.myQRContainer.add(title);

        // QR Code background
        const qrBg = this.add.rectangle(
            this.scale.width / 2,
            90,
            this.scale.width - 80,
            180,
            0xFFFFFF
        );
        qrBg.setStrokeStyle(2, 0xE0E0E0);
        this.myQRContainer.add(qrBg);

        // QR Code placeholder (using emoji)
        const qrCode = this.add.text(
            this.scale.width / 2 - 150,
            90,
            '▓▓▓▓▓▓▓▓\n▓░░░░░░▓\n▓░▓▓▓░▓\n▓░▓▓▓░▓\n▓░░░░░░▓\n▓▓▓▓▓▓▓▓',
            {
                fontSize: '16px',
                color: '#000000',
                lineSpacing: 0,
                fontFamily: 'monospace'
            }
        );
        this.myQRContainer.add(qrCode);

        // User info
        const userInfo = this.add.text(
            this.scale.width / 2 + 20,
            50,
            'username.eth\n🌳 Level 12 Gardener\n🏢 Base Builders',
            {
                fontSize: '16px',
                color: '#2C3E50',
                lineSpacing: 8
            }
        );
        this.myQRContainer.add(userInfo);

        // Action buttons
        const shareBtn = this.createButton(
            this.scale.width / 2 - 100,
            150,
            150,
            40,
            'SHARE QR',
            0x2196F3
        );
        shareBtn.on('pointerdown', () => {
        });
        this.myQRContainer.add(shareBtn);

        const saveBtn = this.createButton(
            this.scale.width / 2 + 100,
            150,
            150,
            40,
            'SAVE IMAGE',
            0x9C27B0
        );
        saveBtn.on('pointerdown', () => {
        });
        this.myQRContainer.add(saveBtn);
    }

    private createHistory() {
        this.historyContainer = this.add.container(0, 100);
        this.historyContainer.setVisible(false);

        // Overlay
        const overlay = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.8
        );
        overlay.setInteractive();
        this.historyContainer.add(overlay);

        // Modal background
        const modalBg = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width - 100,
            this.scale.height - 200,
            0xFFFFFF
        );
        modalBg.setStrokeStyle(3, 0x2196F3);
        this.historyContainer.add(modalBg);

        // Title
        const title = this.add.text(
            this.scale.width / 2,
            150,
            '💧 Today\'s Watering History',
            {
                fontSize: '24px',
                color: '#2C3E50',
                fontStyle: 'bold'
            }
        );
        title.setOrigin(0.5);
        this.historyContainer.add(title);

        // Close button
        const closeBtn = this.add.text(this.scale.width - 120, 130, '✕', {
            fontSize: '32px',
            color: '#7F8C8D'
        }).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            this.toggleHistory();
        });
        this.historyContainer.add(closeBtn);

        // History entries will be added dynamically
    }

    private initializeSampleData() {
        this.connections = [
            {
                username: 'alice.eth',
                address: '0x1234...5678',
                guild: 'Base Builders',
                treeCount: 47,
                timestamp: Date.now() - 3600000, // 1 hour ago
                doubleHandshake: false
            },
            {
                username: 'bob.near',
                address: '0x8765...4321',
                guild: 'Near Natives',
                treeCount: 32,
                timestamp: Date.now() - 1800000, // 30 min ago
                doubleHandshake: true
            }
        ];

        this.todayConnections = this.connections.length;
        this.updateStatsDisplay();
    }

    private simulateScan() {
        if (this.waterRemaining <= 0) {
            this.showMessage('No water remaining! 💧', 0xE74C3C);
            return;
        }

        // Simulate successful scan
        const mockUser = {
            username: `user${Math.floor(Math.random() * 1000)}.eth`,
            address: '0x' + Math.random().toString(16).substr(2, 8) + '...' +
                     Math.random().toString(16).substr(2, 4),
            guild: ['Base Builders', 'Near Natives', 'Solana Squad'][Math.floor(Math.random() * 3)],
            treeCount: Math.floor(Math.random() * 100),
            timestamp: Date.now(),
            doubleHandshake: Math.random() > 0.7 // 30% chance of double handshake
        };

        this.connections.push(mockUser);
        this.waterRemaining--;
        this.todayConnections++;

        // Show success modal
        this.showConnectionSuccess(mockUser);

        this.updateStatsDisplay();
    }

    private showConnectionSuccess(user: ConnectionData) {
        const modal = this.add.container(this.scale.width / 2, this.scale.height / 2);

        // Overlay
        const overlay = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2,
            0x000000, 0.8);
        overlay.setOrigin(0.5);
        overlay.setInteractive();
        modal.add(overlay);

        // Modal background
        const bg = this.add.rectangle(0, 0, 500, 550, 0xFFFFFF);
        bg.setStrokeStyle(3, 0x4CAF50);
        modal.add(bg);

        // Success title
        const title = this.add.text(0, -220, 'CONNECTION SUCCESS!', {
            fontSize: '26px',
            color: '#4CAF50',
            fontStyle: 'bold'
        });
        title.setOrigin(0.5);
        modal.add(title);

        // Handshake animation
        const handshake = this.add.text(0, -160, '🤝', {
            fontSize: '64px'
        });
        handshake.setOrigin(0.5);
        modal.add(handshake);

        // Animate handshake
        this.tweens.add({
            targets: handshake,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 500,
            yoyo: true,
            repeat: 2
        });

        // User info box
        const userBox = this.add.rectangle(0, -20, 440, 180, 0xF5F5F5);
        userBox.setStrokeStyle(2, 0xE0E0E0);
        modal.add(userBox);

        // User avatar (placeholder)
        const avatar = this.add.text(-180, -60, '👤', {
            fontSize: '48px'
        });
        modal.add(avatar);

        // User details
        const userDetails = this.add.text(-120, -70,
            `${user.username}\n🏢 Guild: ${user.guild}\n🌳 Total Trees: ${user.treeCount}`, {
            fontSize: '16px',
            color: '#2C3E50',
            lineSpacing: 8
        });
        modal.add(userDetails);

        // Water info
        const waterInfo = this.add.text(0, 90, '💧 Watered their tree!\n+1 Water used', {
            fontSize: '16px',
            color: '#2196F3',
            align: 'center',
            lineSpacing: 5
        });
        waterInfo.setOrigin(0.5);
        modal.add(waterInfo);

        // Double handshake bonus
        if (user.doubleHandshake) {
            const bonus = this.add.text(0, 140, '✨ DOUBLE HANDSHAKE BONUS! ✨\nThey scanned you too!\n+5 XP Bonus', {
                fontSize: '16px',
                color: '#F39C12',
                align: 'center',
                lineSpacing: 5,
                fontStyle: 'bold'
            });
            bonus.setOrigin(0.5);
            modal.add(bonus);

            // Confetti effect
            this.createConfetti(modal);
        }

        // Action buttons
        const addFriendBtn = this.createModalButton(-120, 220, 200, 45,
            'ADD FRIEND', 0x4CAF50);
        addFriendBtn.on('pointerdown', () => {
            modal.destroy();
        });
        modal.add(addFriendBtn);

        const waterAnotherBtn = this.createModalButton(120, 220, 200, 45,
            'WATER ANOTHER', 0x2196F3);
        waterAnotherBtn.on('pointerdown', () => {
            modal.destroy();
        });
        modal.add(waterAnotherBtn);
    }

    private createConfetti(container: Phaser.GameObjects.Container) {
        const colors = [0xF39C12, 0xE74C3C, 0x3498DB, 0x2ECC71, 0x9B59B6];

        for (let i = 0; i < 20; i++) {
            const confetti = this.add.circle(
                Phaser.Math.Between(-200, 200),
                -300,
                Phaser.Math.Between(3, 8),
                colors[Math.floor(Math.random() * colors.length)]
            );
            container.add(confetti);

            this.tweens.add({
                targets: confetti,
                y: 300,
                x: confetti.x + Phaser.Math.Between(-100, 100),
                angle: Phaser.Math.Between(0, 720),
                duration: Phaser.Math.Between(1000, 2000),
                delay: i * 50,
                onComplete: () => confetti.destroy()
            });
        }
    }

    private createButton(x: number, y: number, width: number, height: number,
                        text: string, color: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, color);
        bg.setInteractive({ useHandCursor: true });

        const label = this.add.text(0, 0, text, {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        label.setOrigin(0.5);

        container.add([bg, label]);

        // Hover effect
        bg.on('pointerover', () => {
            this.tweens.add({ targets: bg, scaleX: 1.05, scaleY: 1.05, duration: 100 });
        });

        bg.on('pointerout', () => {
            this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 100 });
        });

        return container;
    }

    private createModalButton(x: number, y: number, width: number, height: number,
                             text: string, color: number): Phaser.GameObjects.Container {
        return this.createButton(x, y, width, height, text, color);
    }

    private toggleHistory() {
        const isVisible = this.historyContainer.visible;
        this.historyContainer.setVisible(!isVisible);

        if (!isVisible) {
            // Update history display
            this.updateHistoryDisplay();
        }
    }

    private updateHistoryDisplay() {
        // Clear old history entries
        const children = this.historyContainer.getAll();
        children.slice(4).forEach(child => child.destroy()); // Keep overlay, bg, title, close

        let yOffset = 200;

        if (this.connections.length === 0) {
            const emptyText = this.add.text(
                this.scale.width / 2,
                this.scale.height / 2,
                'No connections yet today.\nStart scanning QR codes!',
                {
                    fontSize: '18px',
                    color: '#95A5A6',
                    align: 'center',
                    lineSpacing: 10
                }
            );
            emptyText.setOrigin(0.5);
            this.historyContainer.add(emptyText);
            return;
        }

        this.connections.forEach(connection => {
            const entry = this.createHistoryEntry(connection, yOffset);
            this.historyContainer.add(entry);
            yOffset += 60;
        });

        // Summary
        const summary = this.add.text(
            this.scale.width / 2,
            yOffset + 30,
            `Total: ${this.connections.length} connections today\n🎯 Daily Goal: 10 (${Math.min(100, this.connections.length * 10)}%)`,
            {
                fontSize: '16px',
                color: '#2C3E50',
                align: 'center',
                lineSpacing: 8
            }
        );
        summary.setOrigin(0.5);
        this.historyContainer.add(summary);
    }

    private createHistoryEntry(connection: ConnectionData, y: number): Phaser.GameObjects.Container {
        const container = this.add.container(0, y);

        const bg = this.add.rectangle(this.scale.width / 2, 0,
            this.scale.width - 150, 50, 0xF5F5F5);
        container.add(bg);

        const icon = connection.doubleHandshake ? '✓' : '✓';
        const iconColor = connection.doubleHandshake ? '#4CAF50' : '#2196F3';

        const checkmark = this.add.text(80, -8, icon, {
            fontSize: '24px',
            color: iconColor
        });
        container.add(checkmark);

        const username = this.add.text(120, -15, connection.username, {
            fontSize: '16px',
            color: '#2C3E50',
            fontStyle: 'bold'
        });
        container.add(username);

        const badge = connection.doubleHandshake ?
            this.add.text(280, -12, '(2-way!)', {
                fontSize: '14px',
                color: '#4CAF50',
                fontStyle: 'bold'
            }) : this.add.text(0, 0, '', { fontSize: '1px' });
        container.add(badge);

        const time = new Date(connection.timestamp);
        const timeStr = time.getHours().toString().padStart(2, '0') + ':' +
                       time.getMinutes().toString().padStart(2, '0');

        const timestamp = this.add.text(this.scale.width - 140, -8, timeStr + ' AM', {
            fontSize: '14px',
            color: '#95A5A6'
        });
        container.add(timestamp);

        return container;
    }

    private updateStatsDisplay() {
        // This would update the stats text objects
        // For simplicity, we're not storing references here
    }

    private showMessage(message: string, color: number) {
        const msg = this.add.text(this.scale.width / 2, 100, message, {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#' + color.toString(16).padStart(6, '0'),
            padding: { x: 20, y: 10 }
        });
        msg.setOrigin(0.5);

        this.tweens.add({
            targets: msg,
            y: 50,
            alpha: 0,
            duration: 2000,
            ease: 'Power2',
            onComplete: () => msg.destroy()
        });
    }
}
