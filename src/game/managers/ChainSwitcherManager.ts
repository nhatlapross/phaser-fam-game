import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { EventBus } from '../EventBus';

interface ChainInfo {
    id: number;
    name: string;
    shortName: string;
    color: number;
    colorHex: string;
}

const CHAINS: ChainInfo[] = [
    { id: 421614, name: 'Arbitrum Sepolia', shortName: 'ARB', color: 0x28A0F0, colorHex: '#28A0F0' },
    { id: 102031, name: 'Creditcoin', shortName: 'CTC', color: 0x4ade80, colorHex: '#4ade80' },
];

const BTN_W = 56;
const BTN_H = 22;

/**
 * Small chain switcher button + dropdown placed to the LEFT of the profile panel.
 *
 * Lifecycle is independent from ProfileManager.profileElements — the manager
 * tracks its own elements so double-destroy issues don't occur.
 */
export class ChainSwitcherManager extends BaseManager {
    private btnElements: Phaser.GameObjects.GameObject[] = [];
    private dropElements: Phaser.GameObjects.GameObject[] = [];
    private dropdownOpen: boolean = false;
    private currentChainId: number = 421614;
    private isSwitching: boolean = false;

    private btnCenterX: number = 0;
    private btnCenterY: number = 0;
    private initialized: boolean = false;

    constructor(scene: Phaser.Scene) {
        super(scene);
        EventBus.on('chain-changed', this.onChainChanged, this);
        EventBus.on('chain-switched', this.onChainSwitched, this);
    }

    /**
     * Place the chain button to the LEFT of the profile panel.
     *
     * @param panelX    Center X of the profile panel
     * @param panelY    Center Y of the profile panel
     * @param panelW    Width of the profile panel
     */
    public createChainButton(panelX: number, panelY: number, panelW: number, panelH: number): void {
        const gap = 8;
        this.btnCenterX = panelX - panelW / 2 - gap - BTN_W / 2 + 20;
        // Align to top of profile panel with 5px inner padding
        this.btnCenterY = panelY - panelH / 2 + BTN_H / 2 + 15;
        this.initialized = true;

        this.clearBtnElements();
        this.renderButton();
    }

    public getBtnElements(): Phaser.GameObjects.GameObject[] {
        return this.btnElements;
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    private renderButton(): void {
        if (!this.initialized) return;

        const chain = this.getCurrentChain();

        // Background rectangle — brown to match profile panel
        const bg = this.scene.add.rectangle(
            this.btnCenterX, this.btnCenterY,
            BTN_W, BTN_H,
            0x8D6E63, 1,
        );
        bg.setStrokeStyle(2, 0x4E342E, 1);
        bg.setDepth(5025);
        this.scene.cameras.main.ignore(bg);
        this.btnElements.push(bg);

        // Color dot
        const dot = this.scene.add.circle(
            this.btnCenterX - BTN_W / 2 + 8,
            this.btnCenterY,
            3,
            chain.color,
        );
        dot.setDepth(5026);
        this.scene.cameras.main.ignore(dot);
        this.btnElements.push(dot);

        // Chain label
        const label = this.scene.add.text(
            this.btnCenterX - BTN_W / 2 + 15,
            this.btnCenterY,
            this.isSwitching ? '...' : chain.shortName,
            {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: this.isSwitching ? '#888888' : '#FFFFFF',
                resolution: 2,
            },
        );
        label.setOrigin(0, 0.5);
        label.setDepth(5026);
        this.scene.cameras.main.ignore(label);
        this.btnElements.push(label);

        // Dropdown arrow ▼
        const arrow = this.scene.add.text(
            this.btnCenterX + BTN_W / 2 - 8,
            this.btnCenterY,
            '▼',
            { fontSize: '5px', fontFamily: 'PixelFont', color: '#888888', resolution: 2 },
        );
        arrow.setOrigin(0.5, 0.5);
        arrow.setDepth(5026);
        this.scene.cameras.main.ignore(arrow);
        this.btnElements.push(arrow);

        // Transparent hit area
        const hit = this.scene.add.rectangle(
            this.btnCenterX, this.btnCenterY,
            BTN_W, BTN_H,
            0x000000, 0,
        );
        hit.setDepth(5027);
        hit.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(hit);
        this.btnElements.push(hit);

        hit.on('pointerover', () => bg.setFillStyle(0xA1887F, 1));
        hit.on('pointerout', () => bg.setFillStyle(0x8D6E63, 1));
        hit.on('pointerdown', () => {
            if (this.dropdownOpen) this.closeDropdown();
            else this.openDropdown();
        });
    }

    private openDropdown(): void {
        if (this.dropdownOpen || this.isSwitching) return;
        this.dropdownOpen = true;

        const itemH = 22;
        const dropW = 110;
        const titleH = 16;
        const dropH = titleH + CHAINS.length * itemH + 4;
        // dropdown appears BELOW the button
        const dropLeft = this.btnCenterX - dropW / 2;
        const dropTop = this.btnCenterY + BTN_H / 2 + 4;

        // Background — brown to match profile panel
        const bg = this.scene.add.rectangle(
            dropLeft + dropW / 2,
            dropTop + dropH / 2,
            dropW, dropH,
            0x6D4C41, 1,
        );
        bg.setStrokeStyle(2, 0x4E342E, 1);
        bg.setDepth(5200);
        this.scene.cameras.main.ignore(bg);
        this.dropElements.push(bg);

        // Title
        const title = this.scene.add.text(
            dropLeft + dropW / 2,
            dropTop + 8,
            'Select Chain',
            { fontSize: '7px', fontFamily: 'PixelFont', color: '#888888', resolution: 2 },
        );
        title.setOrigin(0.5, 0.5);
        title.setDepth(5201);
        this.scene.cameras.main.ignore(title);
        this.dropElements.push(title);

        CHAINS.forEach((chain, i) => {
            const rowCenterY = dropTop + titleH + i * itemH + itemH / 2;
            const isCurrent = chain.id === this.currentChainId;

            // Row highlight (current chain)
            if (isCurrent) {
                const rowBg = this.scene.add.rectangle(
                    dropLeft + dropW / 2,
                    rowCenterY,
                    dropW - 8, itemH - 2,
                    chain.color, 0.15,
                );
                rowBg.setDepth(5201);
                this.scene.cameras.main.ignore(rowBg);
                this.dropElements.push(rowBg);
            }

            // Dot
            const dot = this.scene.add.circle(
                dropLeft + 14, rowCenterY,
                4, chain.color,
            );
            dot.setDepth(5202);
            this.scene.cameras.main.ignore(dot);
            this.dropElements.push(dot);

            // Name
            const nameText = this.scene.add.text(
                dropLeft + 24, rowCenterY,
                chain.name,
                {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: isCurrent ? '#FFFFFF' : '#BBBBBB',
                    resolution: 2,
                },
            );
            nameText.setOrigin(0, 0.5);
            nameText.setDepth(5202);
            this.scene.cameras.main.ignore(nameText);
            this.dropElements.push(nameText);

            // Checkmark
            if (isCurrent) {
                const check = this.scene.add.text(
                    dropLeft + dropW - 12, rowCenterY,
                    '✓',
                    { fontSize: '8px', fontFamily: 'PixelFont', color: '#4ade80', resolution: 2 },
                );
                check.setOrigin(0.5, 0.5);
                check.setDepth(5202);
                this.scene.cameras.main.ignore(check);
                this.dropElements.push(check);
            }

            // Hit area for row
            const rowHit = this.scene.add.rectangle(
                dropLeft + dropW / 2,
                rowCenterY,
                dropW - 8, itemH - 2,
                0x000000, 0,
            );
            rowHit.setDepth(5203);
            rowHit.setInteractive({ useHandCursor: !isCurrent });
            this.scene.cameras.main.ignore(rowHit);
            this.dropElements.push(rowHit);

            if (!isCurrent) {
                rowHit.on('pointerdown', () => {
                    this.requestSwitchChain(chain.id);
                });
            }
        });

        // Full-screen close overlay (behind dropdown)
        const closeOverlay = this.scene.add.rectangle(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            this.scene.scale.width,
            this.scene.scale.height,
            0x000000, 0,
        );
        closeOverlay.setDepth(5199);
        closeOverlay.setInteractive();
        this.scene.cameras.main.ignore(closeOverlay);
        this.dropElements.push(closeOverlay);
        closeOverlay.on('pointerdown', () => this.closeDropdown());
    }

    private closeDropdown(): void {
        if (!this.dropdownOpen) return;
        this.dropdownOpen = false;
        this.destroyList(this.dropElements);
        this.dropElements = [];
    }

    private requestSwitchChain(chainId: number): void {
        this.isSwitching = true;
        this.closeDropdown();
        this.clearBtnElements();
        this.renderButton();
        EventBus.emit('request-switch-chain', { chainId });
    }

    // ─── EventBus handlers ────────────────────────────────────────────────────

    private onChainChanged({ chainId }: { chainId: number }): void {
        if (!this.initialized) return;
        this.currentChainId = chainId;
        this.isSwitching = false;
        if (this.dropdownOpen) this.closeDropdown();
        this.clearBtnElements();
        this.renderButton();
    }

    private onChainSwitched({ chainId, success }: { chainId: number; success: boolean }): void {
        if (!this.initialized) return;
        this.isSwitching = false;
        if (success) this.currentChainId = chainId;
        if (this.dropdownOpen) this.closeDropdown();
        this.clearBtnElements();
        this.renderButton();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private getCurrentChain(): ChainInfo {
        return CHAINS.find((c) => c.id === this.currentChainId) ?? CHAINS[0];
    }

    private clearBtnElements(): void {
        this.destroyList(this.btnElements);
        this.btnElements = [];
    }

    private destroyList(list: Phaser.GameObjects.GameObject[]): void {
        list.forEach((el) => {
            try {
                if (el && (el as any).active !== false) el.destroy();
            } catch (_) { /* already destroyed */ }
        });
    }

    public destroy(): void {
        EventBus.off('chain-changed', this.onChainChanged, this);
        EventBus.off('chain-switched', this.onChainSwitched, this);
        this.closeDropdown();
        this.clearBtnElements();
        super.destroy();
    }
}
