import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

interface EventData {
    id: string;
    name: string;
    location: string;
    distance: number; // in km
    x: number;
    y: number;
    status: 'live' | 'upcoming' | 'ended';
    attendees: number;
    seedReward: number;
    endsIn?: number; // hours
    startsOn?: string;
}

export class EventCheckIn extends Scene {
    private viewMode: 'map' | 'list' = 'list';
    private events: EventData[] = [];
    private eventMarkers: Phaser.GameObjects.Container[] = [];
    private listContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('EventCheckIn');
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor(0xF8F9FA);

        // Create header
        this.createHeader();

        // Initialize sample event data
        this.initializeEvents();

        // Create map view (initially hidden)
        this.createMapView();

        // Create list view (initially shown)
        this.createListView();

        // Show list view by default
        this.switchView('list');

        EventBus.emit('current-scene-ready', this);
    }

    private createHeader() {
        // Header background
        const headerBg = this.add.rectangle(0, 0, this.scale.width, 80, 0x2ECC71);
        headerBg.setOrigin(0, 0);

        // Back button
        const backBtn = this.add.text(20, 25, '← Events', {
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.scene.start('HomeGarden');
        });

        // View toggle buttons
        const mapBtn = this.add.text(this.scale.width - 120, 25, '🗺️', {
            fontSize: '28px'
        }).setInteractive({ useHandCursor: true });

        mapBtn.on('pointerdown', () => {
            this.switchView('map');
        });

        const listBtn = this.add.text(this.scale.width - 60, 25, '📋', {
            fontSize: '28px'
        }).setInteractive({ useHandCursor: true });

        listBtn.on('pointerdown', () => {
            this.switchView('list');
        });
    }

    private initializeEvents() {
        this.events = [
            {
                id: 'event1',
                name: 'Token2049 Singapore',
                location: 'Marina Bay Sands',
                distance: 2.3,
                x: 450,
                y: 300,
                status: 'live',
                attendees: 1234,
                seedReward: 3,
                endsIn: 4
            },
            {
                id: 'event2',
                name: 'Web3 Builder Meetup',
                location: 'Tech Hub Central',
                distance: 0.8,
                x: 350,
                y: 250,
                status: 'live',
                attendees: 87,
                seedReward: 2,
                endsIn: 2
            },
            {
                id: 'event3',
                name: 'ETHDenver 2025',
                location: 'Denver, CO',
                distance: 9520,
                x: 200,
                y: 200,
                status: 'upcoming',
                attendees: 0,
                seedReward: 5,
                startsOn: 'Feb 28'
            },
            {
                id: 'event4',
                name: 'Solana Hackathon',
                location: 'Innovation Center',
                distance: 1.5,
                x: 500,
                y: 350,
                status: 'upcoming',
                attendees: 0,
                seedReward: 4,
                startsOn: 'Dec 15'
            },
            {
                id: 'event5',
                name: 'NFT Art Gallery Opening',
                location: 'Downtown District',
                distance: 3.2,
                x: 300,
                y: 400,
                status: 'upcoming',
                attendees: 0,
                seedReward: 2,
                startsOn: 'Dec 10'
            }
        ];
    }

    private createMapView() {
        // Map background (simplified)
        const mapBg = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2 + 40,
            this.scale.width - 40,
            this.scale.height - 180,
            0xE3F2FD
        );
        mapBg.setStrokeStyle(2, 0x90CAF9);
        mapBg.setName('mapView');
        mapBg.setVisible(false);

        // Grid lines (to simulate map)
        const graphics = this.add.graphics();
        graphics.setName('mapView');
        graphics.lineStyle(1, 0xBBDEFB, 0.5);

        const mapX = 20;
        const mapY = 100;
        const mapWidth = this.scale.width - 40;
        const mapHeight = this.scale.height - 180;

        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = mapX + (mapWidth / 10) * i;
            graphics.lineBetween(x, mapY, x, mapY + mapHeight);
        }

        // Horizontal lines
        for (let i = 0; i <= 10; i++) {
            const y = mapY + (mapHeight / 10) * i;
            graphics.lineBetween(mapX, y, mapX + mapWidth, y);
        }

        graphics.setVisible(false);

        // User location marker
        const userMarker = this.add.text(this.scale.width / 2, this.scale.height / 2,
            '📍', {
            fontSize: '32px'
        });
        userMarker.setOrigin(0.5);
        userMarker.setName('mapView');
        userMarker.setVisible(false);

        const userLabel = this.add.text(userMarker.x, userMarker.y + 25, 'You', {
            fontSize: '14px',
            color: '#2196F3',
            backgroundColor: '#ffffffdd',
            padding: { x: 5, y: 2 }
        });
        userLabel.setOrigin(0.5);
        userLabel.setName('mapView');
        userLabel.setVisible(false);

        // Event markers
        this.events.forEach(event => {
            const marker = this.createEventMarker(event);
            this.eventMarkers.push(marker);
        });
    }

    private createEventMarker(event: EventData): Phaser.GameObjects.Container {
        const container = this.add.container(event.x, event.y);
        container.setName('mapView');
        container.setVisible(false);

        // Marker icon
        const icon = this.add.text(0, 0, '🎪', {
            fontSize: '28px'
        });
        icon.setOrigin(0.5);
        container.add(icon);

        // Status indicator
        let statusColor = 0x9E9E9E;
        if (event.status === 'live') statusColor = 0xE74C3C;
        else if (event.status === 'upcoming') statusColor = 0x4CAF50;

        const statusDot = this.add.circle(12, -12, 6, statusColor);
        container.add(statusDot);

        // Interactive
        icon.setInteractive({ useHandCursor: true });
        icon.on('pointerdown', () => {
            this.showEventPreview(event);
        });

        // Pulsing animation for live events
        if (event.status === 'live') {
            this.tweens.add({
                targets: statusDot,
                scale: 1.3,
                alpha: 0.5,
                duration: 1000,
                yoyo: true,
                repeat: -1
            });
        }

        return container;
    }

    private createListView() {
        this.listContainer = this.add.container(0, 100);
        this.listContainer.setName('listView');

        let yOffset = 0;

        // Live Events Section
        const liveEvents = this.events.filter(e => e.status === 'live');
        if (liveEvents.length > 0) {
            const liveHeader = this.add.text(30, yOffset, '🔴 LIVE NOW (' + liveEvents.length + ')', {
                fontSize: '20px',
                color: '#E74C3C',
                fontStyle: 'bold'
            });
            this.listContainer.add(liveHeader);
            yOffset += 40;

            liveEvents.forEach(event => {
                const card = this.createEventCard(event, yOffset);
                this.listContainer.add(card);
                yOffset += 140;
            });
        }

        // Upcoming Events Section
        const upcomingEvents = this.events.filter(e => e.status === 'upcoming');
        if (upcomingEvents.length > 0) {
            yOffset += 10;
            const upcomingHeader = this.add.text(30, yOffset,
                '📅 UPCOMING (' + upcomingEvents.length + ')', {
                fontSize: '20px',
                color: '#4CAF50',
                fontStyle: 'bold'
            });
            this.listContainer.add(upcomingHeader);
            yOffset += 40;

            upcomingEvents.forEach(event => {
                const card = this.createEventCard(event, yOffset);
                this.listContainer.add(card);
                yOffset += 140;
            });
        }
    }

    private createEventCard(event: EventData, y: number): Phaser.GameObjects.Container {
        const container = this.add.container(0, y);

        // Card background
        const cardBg = this.add.rectangle(this.scale.width / 2, 0,
            this.scale.width - 60, 120, 0xFFFFFF);
        cardBg.setStrokeStyle(2, 0xE0E0E0);
        container.add(cardBg);

        // Event icon
        const icon = this.add.text(50, -30, '🎪', {
            fontSize: '32px'
        });
        container.add(icon);

        // Event name
        const name = this.add.text(100, -35, event.name, {
            fontSize: '18px',
            color: '#2C3E50',
            fontStyle: 'bold'
        });
        container.add(name);

        // Location
        const location = this.add.text(100, -10, `📍 ${event.location} • ${event.distance}km`, {
            fontSize: '14px',
            color: '#7F8C8D'
        });
        container.add(location);

        // Status info
        let statusText = '';
        if (event.status === 'live') {
            statusText = `👥 ${event.attendees} checked in\n🌱 +${event.seedReward} Seeds | ⏱️ Ends in ${event.endsIn}h`;
        } else {
            statusText = `📅 Starts ${event.startsOn}\n🌱 +${event.seedReward} Seeds reward`;
        }

        const status = this.add.text(100, 15, statusText, {
            fontSize: '13px',
            color: '#95A5A6',
            lineSpacing: 5
        });
        container.add(status);

        // Action button
        const btnX = this.scale.width - 120;
        const btnY = 10;

        const btnBg = this.add.rectangle(btnX, btnY, 140, 40,
            event.status === 'live' ? 0x4CAF50 : 0x2196F3);
        btnBg.setInteractive({ useHandCursor: true });
        container.add(btnBg);

        const btnText = this.add.text(btnX, btnY,
            event.status === 'live' ? 'CHECK IN →' : 'REMIND ME →', {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        btnText.setOrigin(0.5);
        container.add(btnText);

        btnBg.on('pointerdown', () => {
            if (event.status === 'live') {
                this.startCheckIn(event);
            } else {
                console.log('Reminder set for', event.name);
            }
        });

        // Hover effect
        btnBg.on('pointerover', () => {
            this.tweens.add({
                targets: btnBg,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 100
            });
        });

        btnBg.on('pointerout', () => {
            this.tweens.add({
                targets: btnBg,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });
        });

        return container;
    }

    private showEventPreview(event: EventData) {
        console.log('Show preview for', event.name);
        // Future: Show modal with event details
    }

    private startCheckIn(event: EventData) {
        console.log('Starting check-in for', event.name);

        // Show check-in modal
        const modal = this.createCheckInModal(event);

        // In real implementation, this would:
        // 1. Verify GPS location
        // 2. Show QR scanner
        // 3. Take photo for AI verification
        // 4. Award seeds
    }

    private createCheckInModal(event: EventData): Phaser.GameObjects.Container {
        const modal = this.add.container(this.scale.width / 2, this.scale.height / 2);

        // Overlay
        const overlay = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2,
            0x000000, 0.7);
        overlay.setOrigin(0.5);
        overlay.setInteractive();
        modal.add(overlay);

        // Modal background
        const bg = this.add.rectangle(0, 0, 600, 500, 0xFFFFFF);
        bg.setStrokeStyle(3, 0x4CAF50);
        modal.add(bg);

        // Title
        const title = this.add.text(0, -200, 'CHECK IN TO EVENT', {
            fontSize: '24px',
            color: '#2C3E50',
            fontStyle: 'bold'
        });
        title.setOrigin(0.5);
        modal.add(title);

        // QR Scanner placeholder
        const scannerBg = this.add.rectangle(0, -50, 400, 250, 0xE3F2FD);
        scannerBg.setStrokeStyle(2, 0x2196F3);
        modal.add(scannerBg);

        const scannerText = this.add.text(0, -50, '📱 QR CODE SCANNER\n\nScan the event QR code', {
            fontSize: '18px',
            color: '#7F8C8D',
            align: 'center',
            lineSpacing: 10
        });
        scannerText.setOrigin(0.5);
        modal.add(scannerText);

        // OR divider
        const orText = this.add.text(0, 110, '- OR -', {
            fontSize: '16px',
            color: '#95A5A6'
        });
        orText.setOrigin(0.5);
        modal.add(orText);

        // Photo button
        const photoBtn = this.add.rectangle(0, 160, 300, 50, 0x9C27B0);
        photoBtn.setInteractive({ useHandCursor: true });
        modal.add(photoBtn);

        const photoText = this.add.text(0, 160, '📸 TAKE EVENT PHOTO', {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        photoText.setOrigin(0.5);
        modal.add(photoText);

        photoBtn.on('pointerdown', () => {
            this.completeCheckIn(event, modal);
        });

        // Close button
        const closeBtn = this.add.text(270, -210, '✕', {
            fontSize: '28px',
            color: '#7F8C8D'
        }).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            modal.destroy();
        });

        modal.add(closeBtn);

        return modal;
    }

    private completeCheckIn(event: EventData, modal: Phaser.GameObjects.Container) {
        // Simulate successful check-in
        modal.destroy();

        // Show seed gacha animation
        this.showSeedGacha(event.seedReward);

        // Update event data
        event.attendees++;

        EventBus.emit('event-checked-in', { eventId: event.id, seedsEarned: event.seedReward });
    }

    private showSeedGacha(seedCount: number) {
        const gacha = this.add.container(this.scale.width / 2, this.scale.height / 2);

        // Overlay
        const overlay = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2,
            0x000000, 0.8);
        overlay.setOrigin(0.5);
        gacha.add(overlay);

        // Title
        const title = this.add.text(0, -150, '✨ SEEDS RECEIVED! ✨', {
            fontSize: '28px',
            color: '#F39C12',
            fontStyle: 'bold'
        });
        title.setOrigin(0.5);
        gacha.add(title);

        // Seeds
        const seedEmojis = ['🌰', '🌰', '🍄'];
        for (let i = 0; i < Math.min(seedCount, 3); i++) {
            const seed = this.add.text(-120 + i * 120, 0, seedEmojis[i], {
                fontSize: '64px'
            });
            seed.setOrigin(0.5);
            seed.setAlpha(0);
            gacha.add(seed);

            // Flip animation
            this.tweens.add({
                targets: seed,
                alpha: 1,
                scaleX: { from: 0, to: 1 },
                scaleY: { from: 0, to: 1 },
                duration: 500,
                delay: i * 200,
                ease: 'Back.easeOut'
            });
        }

        // Reward text
        const reward = this.add.text(0, 100, `+${seedCount} Seeds added to inventory!`, {
            fontSize: '18px',
            color: '#ffffff'
        });
        reward.setOrigin(0.5);
        gacha.add(reward);

        // Close button
        const closeBtn = this.add.rectangle(0, 180, 200, 50, 0x4CAF50);
        closeBtn.setInteractive({ useHandCursor: true });
        gacha.add(closeBtn);

        const closeText = this.add.text(0, 180, 'CLAIM REWARDS', {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        closeText.setOrigin(0.5);
        gacha.add(closeText);

        closeBtn.on('pointerdown', () => {
            gacha.destroy();
        });
    }

    private switchView(mode: 'map' | 'list') {
        this.viewMode = mode;

        // Hide/show elements based on mode
        this.children.each((child: Phaser.GameObjects.GameObject) => {
            const gameObject = child as any;

            if (gameObject.name === 'mapView') {
                gameObject.setVisible(mode === 'map');
            } else if (gameObject.name === 'listView') {
                gameObject.setVisible(mode === 'list');
            }
        });

        // Handle markers separately
        this.eventMarkers.forEach(marker => {
            marker.setVisible(mode === 'map');
        });

        // Show/hide list container
        this.listContainer.setVisible(mode === 'list');
    }
}
