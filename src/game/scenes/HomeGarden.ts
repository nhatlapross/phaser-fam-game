import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

interface PlantData {
    stage: 'empty' | 'seed' | 'sprout' | 'growing' | 'mature' | 'fruiting' | 'dead';
    health: number;
    timeRemaining: number; // in seconds
    type: 'social' | 'tech' | 'mushroom' | 'branded';
    waterCount: number;
    fertilizerCount: number;
}

export class HomeGarden extends Scene {
    private plots: Phaser.GameObjects.Container[] = [];
    private plotData: PlantData[] = [];
    private selectedPlotIndex: number = -1;

    // UI Elements
    private waterCount: number = 15;
    private fertilizerCount: number = 3;
    private xpBar!: Phaser.GameObjects.Graphics;
    private statsText!: Phaser.GameObjects.Text;

    // Grid configuration
    private readonly GRID_COLS = 4;
    private readonly GRID_ROWS = 3;
    private readonly PLOT_SIZE = 120;
    private readonly PLOT_SPACING = 20;
    private readonly GRID_START_X = 220;
    private readonly GRID_START_Y = 200;

    constructor() {
        super('HomeGarden');
    }

    create() {
        // Set background color (Solarpunk green theme)
        this.cameras.main.setBackgroundColor(0xE8F5E9);

        // Create header
        this.createHeader();

        // Create stats bar
        this.createStatsBar();

        // Create weather system
        this.createWeatherSystem();

        // Initialize plot data
        this.initializePlots();

        // Create garden grid
        this.createGardenGrid();

        // Create action buttons
        this.createActionButtons();

        // Create bottom navigation
        this.createBottomNavigation();

        // Start update timer for plant health
        this.time.addEvent({
            delay: 1000, // Update every second
            callback: this.updatePlants,
            callbackScope: this,
            loop: true
        });

        EventBus.emit('current-scene-ready', this);
    }

    private createBottomNavigation() {
        const navY = this.scale.height - 140;
        const navBg = this.add.rectangle(this.scale.width / 2, navY - 10,
            this.scale.width, 60, 0xFFFFFF);
        navBg.setStrokeStyle(2, 0xE0E0E0);

        const btnWidth = 150;
        const spacing = 40;
        const startX = (this.scale.width - (btnWidth * 3 + spacing * 2)) / 2;

        // Home button (current scene)
        const homeBtn = this.add.text(startX + btnWidth / 2, navY - 10,
            '🏡 Home', {
            fontSize: '16px',
            color: '#4CAF50',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Events button
        const eventsBtn = this.add.text(startX + btnWidth + spacing + btnWidth / 2, navY - 10,
            '🎪 Events', {
            fontSize: '16px',
            color: '#7F8C8D'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        eventsBtn.on('pointerdown', () => {
            this.scene.start('EventCheckIn');
        });

        // Network button
        const networkBtn = this.add.text(startX + (btnWidth + spacing) * 2 + btnWidth / 2, navY - 10,
            '💧 Network', {
            fontSize: '16px',
            color: '#7F8C8D'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        networkBtn.on('pointerdown', () => {
            this.scene.start('Networking');
        });
    }

    private createHeader() {
        // Header background
        const headerBg = this.add.rectangle(0, 0, this.scale.width, 80, 0x2ECC71);
        headerBg.setOrigin(0, 0);

        // Title
        const title = this.add.text(20, 20, '🌳 OverGuild', {
            fontSize: '32px',
            fontFamily: 'Arial',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        // Notification bell (placeholder)
        const bellBtn = this.add.text(this.scale.width - 120, 25, '🔔', {
            fontSize: '28px'
        }).setInteractive({ useHandCursor: true });

        bellBtn.on('pointerdown', () => {
        });

        // Settings icon
        const settingsBtn = this.add.text(this.scale.width - 60, 25, '⚙️', {
            fontSize: '28px'
        }).setInteractive({ useHandCursor: true });

        settingsBtn.on('pointerdown', () => {
        });
    }

    private createStatsBar() {
        const statsY = 100;

        // Player info
        const playerName = this.add.text(20, statsY, '👤 Player | LV 12', {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#2C3E50'
        });

        // XP Bar
        const xpBarBg = this.add.rectangle(20, statsY + 35, 200, 15, 0xE0E0E0);
        xpBarBg.setOrigin(0, 0);

        this.xpBar = this.add.graphics();
        this.xpBar.fillStyle(0x4CAF50, 1);
        this.xpBar.fillRect(20, statsY + 35, 160, 15); // 80% filled (1234/2000 XP)

        const xpText = this.add.text(230, statsY + 32, '1,234 XP', {
            fontSize: '14px',
            color: '#666'
        });

        // Resources
        this.statsText = this.add.text(400, statsY + 10,
            `💧 Water: ${this.waterCount} | 🧪 Fertilizer: ${this.fertilizerCount}`, {
            fontSize: '18px',
            color: '#2C3E50',
            fontStyle: 'bold'
        });
    }

    private createWeatherSystem() {
        const weatherY = 165;

        const weatherBg = this.add.rectangle(20, weatherY, this.scale.width - 40, 35, 0xFFFFFF, 0.9);
        weatherBg.setOrigin(0, 0);

        const weatherText = this.add.text(40, weatherY + 8, '🌤️ Weather: Sunny (+10% growth)', {
            fontSize: '16px',
            color: '#F39C12',
            fontStyle: 'bold'
        });
    }

    private initializePlots() {
        // Initialize 12 plots (4x3 grid)
        for (let i = 0; i < this.GRID_COLS * this.GRID_ROWS; i++) {
            this.plotData.push({
                stage: i === 0 ? 'sprout' : i === 1 ? 'growing' : i === 2 ? 'mature' : 'empty',
                health: i < 3 ? 80 - (i * 15) : 100,
                timeRemaining: i < 3 ? (72 - i * 24) * 3600 : 0, // Convert hours to seconds
                type: 'social',
                waterCount: 0,
                fertilizerCount: 0
            });
        }
    }

    private createGardenGrid() {
        for (let row = 0; row < this.GRID_ROWS; row++) {
            for (let col = 0; col < this.GRID_COLS; col++) {
                const index = row * this.GRID_COLS + col;
                const x = this.GRID_START_X + col * (this.PLOT_SIZE + this.PLOT_SPACING);
                const y = this.GRID_START_Y + row * (this.PLOT_SIZE + this.PLOT_SPACING);

                const plot = this.createPlot(x, y, index);
                this.plots.push(plot);
            }
        }
    }

    private createPlot(x: number, y: number, index: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);
        const data = this.plotData[index];

        // Plot background (dirt)
        const plotBg = this.add.rectangle(0, 0, this.PLOT_SIZE, this.PLOT_SIZE, 0x8B7355, 1);
        plotBg.setStrokeStyle(2, 0x6B5345);
        plotBg.setInteractive({ useHandCursor: true });

        plotBg.on('pointerdown', () => {
            this.onPlotClick(index);
        });

        container.add(plotBg);

        // Plant sprite based on stage
        if (data.stage !== 'empty') {
            const plant = this.createPlantSprite(data);
            container.add(plant);

            // Health bar
            if (data.stage !== 'dead') {
                const healthBar = this.createHealthBar(data.health);
                healthBar.y = -this.PLOT_SIZE / 2 + 10;
                container.add(healthBar);
            }

            // Timer text
            if (data.timeRemaining > 0) {
                const timeText = this.add.text(0, this.PLOT_SIZE / 2 - 25,
                    this.formatTime(data.timeRemaining), {
                    fontSize: '14px',
                    color: data.health < 30 ? '#E74C3C' : '#2ECC71',
                    backgroundColor: '#00000088',
                    padding: { x: 5, y: 2 }
                });
                timeText.setOrigin(0.5);
                container.add(timeText);
            }

            // Warning icon for critical health
            if (data.health < 30 && data.stage !== 'dead') {
                const warning = this.add.text(this.PLOT_SIZE / 2 - 20, -this.PLOT_SIZE / 2 + 10,
                    '⚠️', {
                    fontSize: '20px'
                });
                container.add(warning);

                // Pulsing animation
                this.tweens.add({
                    targets: warning,
                    alpha: 0.3,
                    duration: 500,
                    yoyo: true,
                    repeat: -1
                });
            }
        } else {
            // Empty plot - show + button
            const plusBtn = this.add.text(0, 0, '+', {
                fontSize: '48px',
                color: '#95A5A6'
            });
            plusBtn.setOrigin(0.5);
            container.add(plusBtn);
        }

        return container;
    }

    private createPlantSprite(data: PlantData): Phaser.GameObjects.Text {
        // Using emoji as placeholders - in production, use actual sprites
        let emoji = '🌱';
        let scale = 1;

        switch (data.stage) {
            case 'seed':
                emoji = '🌰';
                scale = 0.8;
                break;
            case 'sprout':
                emoji = '🌱';
                scale = 1;
                break;
            case 'growing':
                emoji = '🌿';
                scale = 1.2;
                break;
            case 'mature':
                emoji = '🌳';
                scale = 1.5;
                break;
            case 'fruiting':
                emoji = '🍎';
                scale = 1.5;
                break;
            case 'dead':
                emoji = '💀';
                scale = 1;
                break;
        }

        const plant = this.add.text(0, 0, emoji, {
            fontSize: `${48 * scale}px`
        });
        plant.setOrigin(0.5);

        // Gentle sway animation
        if (data.stage !== 'dead' && data.stage !== 'empty') {
            this.tweens.add({
                targets: plant,
                angle: { from: -2, to: 2 },
                duration: 2000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        return plant;
    }

    private createHealthBar(health: number): Phaser.GameObjects.Container {
        const container = this.add.container(0, 0);

        // Background
        const bg = this.add.rectangle(0, 0, 80, 8, 0xE0E0E0);
        container.add(bg);

        // Health fill
        const healthColor = health > 60 ? 0x4CAF50 : health > 30 ? 0xFFC107 : 0xE74C3C;
        const fill = this.add.rectangle(-(80 - (80 * health / 100)) / 2, 0,
            80 * health / 100, 8, healthColor);
        fill.setOrigin(0, 0.5);
        fill.x = -40;
        container.add(fill);

        return container;
    }

    private formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        return `${hours}h`;
    }

    private createActionButtons() {
        const btnY = this.scale.height - 80;
        const btnWidth = 180;
        const btnHeight = 50;
        const spacing = 20;
        const startX = (this.scale.width - (btnWidth * 3 + spacing * 2)) / 2;

        // Plant Seed Button
        const plantBtn = this.createButton(startX, btnY, btnWidth, btnHeight,
            '🌱 Plant', 0x4CAF50);
        plantBtn.on('pointerdown', () => this.onPlantClick());

        // Water Button
        const waterBtn = this.createButton(startX + btnWidth + spacing, btnY,
            btnWidth, btnHeight, '💧 Water', 0x2196F3);
        waterBtn.on('pointerdown', () => this.onWaterClick());

        // Fertilize Button
        const fertilizeBtn = this.createButton(startX + (btnWidth + spacing) * 2, btnY,
            btnWidth, btnHeight, '🧪 Fertilize', 0x9C27B0);
        fertilizeBtn.on('pointerdown', () => this.onFertilizeClick());
    }

    private createButton(x: number, y: number, width: number, height: number,
                        text: string, color: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, color);
        bg.setInteractive({ useHandCursor: true });

        const label = this.add.text(0, 0, text, {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        label.setOrigin(0.5);

        container.add([bg, label]);

        // Hover effect
        bg.on('pointerover', () => {
            this.tweens.add({
                targets: bg,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 100
            });
        });

        bg.on('pointerout', () => {
            this.tweens.add({
                targets: bg,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });
        });

        return container;
    }

    private onPlotClick(index: number) {
        this.selectedPlotIndex = index;
        const data = this.plotData[index];


        if (data.stage === 'empty') {
            // Show seed selection modal (future implementation)
        } else if (data.stage === 'fruiting') {
            // Harvest
            this.harvestPlant(index);
        } else {
            // Show plant details
        }
    }

    private onPlantClick() {
        // Open seed inventory (future implementation)
        EventBus.emit('open-seed-inventory');
    }

    private onWaterClick() {
        if (this.waterCount <= 0) {
            return;
        }

        if (this.selectedPlotIndex >= 0) {
            const data = this.plotData[this.selectedPlotIndex];
            if (data.stage !== 'empty' && data.stage !== 'dead') {
                this.waterCount--;
                data.waterCount++;
                data.health = Math.min(100, data.health + 20);

                // Update UI
                this.updateStatsText();
                this.refreshPlot(this.selectedPlotIndex);

                // Water animation
                this.showWaterEffect(this.selectedPlotIndex);

            }
        } else {
        }
    }

    private onFertilizeClick() {
        if (this.fertilizerCount <= 0) {
            return;
        }

        if (this.selectedPlotIndex >= 0) {
            const data = this.plotData[this.selectedPlotIndex];
            if (data.stage !== 'empty' && data.stage !== 'dead' && data.stage !== 'fruiting') {
                this.fertilizerCount--;
                data.fertilizerCount++;

                // Speed up growth
                data.timeRemaining = Math.max(0, data.timeRemaining - 3600 * 12); // -12 hours

                // Update UI
                this.updateStatsText();
                this.refreshPlot(this.selectedPlotIndex);

            }
        } else {
        }
    }

    private harvestPlant(index: number) {
        const data = this.plotData[index];
        if (data.stage === 'fruiting') {

            // Reset plot
            data.stage = 'empty';
            data.health = 100;
            data.timeRemaining = 0;
            data.waterCount = 0;
            data.fertilizerCount = 0;

            this.refreshPlot(index);

            // Show harvest animation
            EventBus.emit('fruit-harvested', { plotIndex: index, fruitType: data.type });
        }
    }

    private showWaterEffect(index: number) {
        const plot = this.plots[index];

        // Create water droplets
        for (let i = 0; i < 5; i++) {
            const droplet = this.add.circle(
                plot.x + Phaser.Math.Between(-30, 30),
                plot.y - 60,
                4,
                0x2196F3
            );

            this.tweens.add({
                targets: droplet,
                y: plot.y + 20,
                alpha: 0,
                duration: 500,
                delay: i * 50,
                onComplete: () => droplet.destroy()
            });
        }
    }

    private updatePlants() {
        let needsRefresh = false;

        this.plotData.forEach((data, index) => {
            if (data.stage !== 'empty' && data.stage !== 'dead' && data.timeRemaining > 0) {
                data.timeRemaining--;

                // Decrease health over time if no water
                if (data.timeRemaining % 3600 === 0) { // Every hour
                    data.health = Math.max(0, data.health - 1);

                    if (data.health <= 0) {
                        data.stage = 'dead';
                    }

                    needsRefresh = true;
                }

                // Growth stages
                if (data.timeRemaining <= 0 && data.health > 0) {
                    this.advancePlantStage(index);
                    needsRefresh = true;
                }
            }
        });

        if (needsRefresh) {
            this.refreshAllPlots();
        }
    }

    private advancePlantStage(index: number) {
        const data = this.plotData[index];

        switch (data.stage) {
            case 'seed':
                data.stage = 'sprout';
                data.timeRemaining = 24 * 3600; // 24 hours
                break;
            case 'sprout':
                data.stage = 'growing';
                data.timeRemaining = 24 * 3600;
                break;
            case 'growing':
                data.stage = 'mature';
                data.timeRemaining = 24 * 3600;
                break;
            case 'mature':
                data.stage = 'fruiting';
                data.timeRemaining = 0;
                break;
        }
    }

    private refreshPlot(index: number) {
        // Destroy old plot
        this.plots[index].destroy();

        // Create new plot
        const row = Math.floor(index / this.GRID_COLS);
        const col = index % this.GRID_COLS;
        const x = this.GRID_START_X + col * (this.PLOT_SIZE + this.PLOT_SPACING);
        const y = this.GRID_START_Y + row * (this.PLOT_SIZE + this.PLOT_SPACING);

        this.plots[index] = this.createPlot(x, y, index);
    }

    private refreshAllPlots() {
        this.plots.forEach((plot, index) => {
            this.refreshPlot(index);
        });
    }

    private updateStatsText() {
        this.statsText.setText(
            `💧 Water: ${this.waterCount} | 🧪 Fertilizer: ${this.fertilizerCount}`
        );
    }
}
