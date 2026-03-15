import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ClassroomChatService, LessonResponse, LessonSummary } from '../ClassroomChatService';
import { marked } from 'marked';

type WinId = 'leo' | 'notepad' | 'mydocs';

interface FsItem {
    id: string;
    type: 'file' | 'folder';
    name: string;
    parentId: string | null; // null = root (My Documents)
    content?: string;
    savedAt?: string;
}
type WinState = 'normal' | 'minimized' | 'maximized';

interface WinConfig {
    id: WinId;
    title: string;
    icon: string;
    state: WinState;
    open: boolean;
    defaultBounds: { x: number; y: number; w: number; h: number };
    container: Phaser.GameObjects.Container | null;
}

/**
 * WindowsXP Scene — A full Windows XP desktop simulation.
 *
 * Apps:
 *  • Leo Playbook  — lesson viewer (min/max/close)
 *  • Notepad       — text editor, auto-saves to localStorage
 *
 * Features: Start menu, taskbar with window buttons, system tray, Bliss wallpaper.
 */
export class WindowsXP extends Scene {
    private chatService!: ClassroomChatService;

    // ── Window registry ──────────────────────────────────────────────────────
    private wins = new Map<WinId, WinConfig>();
    private focusStack: WinId[] = []; // last = topmost / focused

    // ── HTML overlay elements ────────────────────────────────────────────────
    private leoListEl: HTMLDivElement | null = null;
    private leoContentEl: HTMLDivElement | null = null;
    private notepadTextEl: HTMLTextAreaElement | null = null;
    private myDocsTreeEl: HTMLDivElement | null = null;
    private myDocsListEl: HTMLDivElement | null = null;
    private notepadFileMenuEl: HTMLDivElement | null = null;
    private dialogEl: HTMLDivElement | null = null;
    private ctxMenuEl: HTMLDivElement | null = null;

    // ── Leo sidebar state ─────────────────────────────────────────────────────
    private leoLessons: LessonSummary[] = [];
    private leoFilter  = '';
    private leoCollapsed = new Set<string>();
    private leoActiveSlug = '';

    // ── Notepad state ─────────────────────────────────────────────────────────
    private notepadFilename = 'Untitled';
    private notepadFileId: string | null = null;

    // ── My Documents state ────────────────────────────────────────────────────
    private myDocsFolderId: string | null = null;
    private myDocsBackStack: Array<string | null> = [];
    private myDocsTreeCollapsed = new Set<string>(); // tree node ids that are collapsed

    // ── Taskbar ──────────────────────────────────────────────────────────────
    private taskbarWinBtns: Phaser.GameObjects.Container | null = null;
    private clockText: Phaser.GameObjects.Text | null = null;

    // ── Transition guard ──────────────────────────────────────────────────────
    private isShuttingDown = false;

    // ── Start menu ───────────────────────────────────────────────────────────
    private startMenuContainer: Phaser.GameObjects.Container | null = null;
    private startMenuOpen = false;

    // ── Desktop constants ────────────────────────────────────────────────────
    private readonly DW = 960;
    private readonly DH = 500; // 540 − 40px taskbar

    // ── Default window bounds ────────────────────────────────────────────────
    private readonly DEFAULT_BOUNDS: Record<WinId, WinConfig['defaultBounds']> = {
        leo:     { x: 75,  y: 16,  w: 800, h: 462 },
        notepad: { x: 145, y: 55,  w: 400, h: 300 },
        mydocs:  { x: 120, y: 40,  w: 540, h: 360 },
    };

    // ── Window chrome heights ────────────────────────────────────────────────
    private readonly TB_H  = 28; // title bar
    private readonly MB_H  = 22; // menu bar (both apps)
    private readonly TOOL_H = 26; // toolbar (Leo only)
    private readonly ADDR_H = 24; // address bar (Leo only)
    private readonly STAT_H = 18; // status bar (Leo only)
    private readonly LEO_SIDEBAR_W = 190;

    // ── localStorage keys ────────────────────────────────────────────────────
    private readonly NOTEPAD_KEY = 'xp-notepad-content';
    private readonly FS_KEY      = 'og-filesystem';

    constructor() {
        super('WindowsXP');
    }

    init(_data: unknown) {
        this.isShuttingDown  = false;
        this.startMenuOpen   = false;
        this.focusStack      = [];
        this.myDocsFolderId      = null;
        this.myDocsBackStack     = [];
        this.myDocsTreeCollapsed = new Set();
        this.notepadFilename = 'Untitled';
        this.notepadFileId   = null;
        this.leoLessons      = [];
        this.leoFilter       = '';
        this.leoCollapsed    = new Set();
        this.leoActiveSlug   = '';
    }

    preload() {
        this.load.image('og-badge', '/assets/badge/OG-badge.png');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCENE LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════

    create() {
        this.chatService = ClassroomChatService.getInstance();

        this.initWinConfigs();

        // Desktop layers
        this.drawBliss();
        this.drawDesktopIcons();

        // Taskbar (persistent, always on top)
        this.buildTaskbar();

        // Open Leo Playbook by default
        this.openWindow('leo');

        // Create HTML elements (hidden initially until updateAllHtml positions them)
        this.createLeoHtml();
        this.createNotepadHtml();
        this.createMyDocsHtml();
        this.updateAllHtml();

        // Load lesson list
        this.loadLessons();

        // Keyboard
        this.input.keyboard?.on('keydown-ESC', () => {
            if (this.startMenuOpen) { this.closeStartMenu(); return; }
            this.closeXP();
        });

        EventBus.emit('current-scene-ready', this);

        // Show XP boot screen on top of everything
        this.showWelcomeScreen();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WINDOW MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    private initWinConfigs() {
        const defs: Array<[WinId, string, string]> = [
            ['leo',     '📚 Leo Playbook', '📚'],
            ['notepad', '📝 Notepad',      '📝'],
            ['mydocs',  '📁 My Documents', '📁'],
        ];
        defs.forEach(([id, title, icon]) => {
            this.wins.set(id, {
                id, title, icon,
                state: 'normal', open: false,
                defaultBounds: { ...this.DEFAULT_BOUNDS[id] },
                container: null,
            });
        });
    }

    private openWindow(id: WinId) {
        const win = this.wins.get(id)!;
        if (win.open) {
            if (win.state === 'minimized') this.restoreWindow(id);
            else this.focusWindow(id);
            return;
        }
        win.open = true;
        win.state = 'normal';
        this.focusStack.push(id);
        this.renderWindow(id);
        this.refreshTaskbar();
        this.updateAllHtml();
        this.closeStartMenu();
    }

    private closeWindow(id: WinId) {
        const win = this.wins.get(id)!;
        if (!win.open) return;

        win.open = false;
        win.container?.destroy();
        win.container = null;
        this.focusStack = this.focusStack.filter(w => w !== id);

        // Focus whatever is now on top
        if (this.focusStack.length > 0) {
            this.focusWindow(this.focusStack[this.focusStack.length - 1]);
        }
        this.refreshTaskbar();
        this.updateAllHtml();
    }

    private minimizeWindow(id: WinId) {
        const win = this.wins.get(id)!;
        if (!win.open || win.state === 'minimized') return;

        win.state = 'minimized';
        win.container?.setVisible(false);

        this.focusStack = this.focusStack.filter(w => w !== id);
        if (this.focusStack.length > 0) {
            this.focusWindow(this.focusStack[this.focusStack.length - 1]);
        }
        this.refreshTaskbar();
        this.updateAllHtml();
    }

    private maximizeWindow(id: WinId) {
        const win = this.wins.get(id)!;
        if (!win.open) return;

        win.state = win.state === 'maximized' ? 'normal' : 'maximized';
        win.container?.destroy();
        win.container = null;
        this.renderWindow(id);
        this.focusWindow(id);
        this.updateAllHtml();
    }

    private restoreWindow(id: WinId) {
        const win = this.wins.get(id)!;
        if (!win.open || win.state !== 'minimized') return;

        win.state = 'normal';
        win.container?.setVisible(true);

        if (!this.focusStack.includes(id)) this.focusStack.push(id);
        this.focusWindow(id);
        this.updateAllHtml();
    }

    private focusWindow(id: WinId) {
        // Reorder focus stack
        this.focusStack = this.focusStack.filter(w => w !== id);
        this.focusStack.push(id);

        // Rebuild depth ordering for containers
        this.focusStack.forEach((wid, i) => {
            const w = this.wins.get(wid)!;
            if (w.container) w.container.setDepth(100 + i * 10);
        });

        // Redraw title bars (active colour changes)
        this.redrawAllTitlebars();
        this.updateAllHtmlZIndex();
        this.refreshTaskbar();
    }

    private renderWindow(id: WinId) {
        const win = this.wins.get(id)!;
        win.container?.destroy();

        const b = this.getWinBounds(win);
        const container = this.add.container(b.x, b.y);
        container.setDepth(100 + this.focusStack.indexOf(id) * 10);
        win.container = container;

        const isFocused = this.focusStack[this.focusStack.length - 1] === id;
        this.drawWindowChrome(container, win, b.w, b.h, isFocused);

        if (id === 'leo')     this.drawLeoChrome(container, win, b);
        if (id === 'notepad') this.drawNotepadChrome(container, win, b);
        if (id === 'mydocs')  this.drawMyDocsChrome(container, b);
    }

    private redrawAllTitlebars() {
        // Full redraw (simplest correctness guarantee)
        this.wins.forEach(win => {
            if (win.open && win.state !== 'minimized') {
                this.renderWindow(win.id);
            }
        });
    }

    private getWinBounds(win: WinConfig) {
        if (win.state === 'maximized') return { x: 0, y: 0, w: this.DW, h: this.DH };
        return { ...win.defaultBounds };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DRAWING — WINDOW CHROME
    // ═══════════════════════════════════════════════════════════════════════

    private drawWindowChrome(
        c: Phaser.GameObjects.Container,
        win: WinConfig,
        w: number, h: number,
        focused: boolean
    ) {
        const { TB_H } = this;
        const g = this.add.graphics();

        // Shadow
        g.fillStyle(0x000000, 0.2);
        g.fillRect(4, 4, w, h);

        // Window body
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, 0, w, h);

        // 3D border
        g.lineStyle(2, 0xFFFFFF, 1);
        g.lineBetween(0, 0, w, 0);
        g.lineBetween(0, 0, 0, h);
        g.lineStyle(2, 0x808080, 1);
        g.lineBetween(w, 0, w, h);
        g.lineBetween(0, h, w, h);

        // Title bar gradient
        if (focused) {
            for (let px = 0; px < w; px++) {
                const t = px / w;
                const r = Math.round(0   + 49 * t);
                const gr = Math.round(59  + 53 * t);
                const b  = Math.round(188 + 27 * t);
                g.fillStyle((r << 16) | (gr << 8) | b, 1);
                g.fillRect(px, 0, 1, TB_H);
            }
            g.fillStyle(0x6C9FD4, 0.32);
            g.fillRect(0, 0, w, Math.round(TB_H * 0.4));
        } else {
            // Inactive gray
            for (let px = 0; px < w; px++) {
                const t = px / w;
                const v = Math.round(120 + 30 * t);
                g.fillStyle((v << 16) | (v << 8) | v, 1);
                g.fillRect(px, 0, 1, TB_H);
            }
        }
        c.add(g);

        // App icon + title text
        const titleCol = focused ? '#FFFFFF' : '#CCCCCC';
        const titleText = this.add.text(10, TB_H / 2, win.title, {
            fontSize: '10px', fontFamily: 'Tahoma, Arial, sans-serif',
            color: titleCol, resolution: 2,
            shadow: focused ? { offsetX: 1, offsetY: 1, color: '#000044', blur: 0, fill: true } : undefined,
        }).setOrigin(0, 0.5);
        c.add(titleText);

        // ── Window control buttons ──
        const btnH = TB_H - 6;
        const btnY = 3;
        const btnW = 20;
        const gap  = 2;
        const btnG = this.add.graphics();

        // Minimize
        const minX = w - 3 * (btnW + gap) - 4;
        btnG.fillStyle(focused ? 0x5B8FC0 : 0x888888, 1);
        btnG.fillRoundedRect(minX, btnY, btnW, btnH, 3);
        btnG.lineStyle(1, focused ? 0x8BAED4 : 0xAAAAAA, 1);
        btnG.strokeRoundedRect(minX, btnY, btnW, btnH, 3);

        // Maximize
        const maxX = w - 2 * (btnW + gap) - 4;
        btnG.fillStyle(focused ? 0x5B8FC0 : 0x888888, 1);
        btnG.fillRoundedRect(maxX, btnY, btnW, btnH, 3);
        btnG.lineStyle(1, focused ? 0x8BAED4 : 0xAAAAAA, 1);
        btnG.strokeRoundedRect(maxX, btnY, btnW, btnH, 3);

        // Close
        const closeX = w - (btnW + gap) - 4;
        btnG.fillStyle(0xC93033, 1);
        btnG.fillRoundedRect(closeX, btnY, btnW, btnH, 3);
        btnG.lineStyle(1, 0xE05858, 1);
        btnG.strokeRoundedRect(closeX, btnY, btnW, btnH, 3);
        c.add(btnG);

        // Button labels
        [
            { x: minX + btnW / 2, t: '─' },
            { x: maxX + btnW / 2, t: win.state === 'maximized' ? '❐' : '□' },
            { x: closeX + btnW / 2, t: '✕' },
        ].forEach(({ x, t }) => {
            const txt = this.add.text(x, TB_H / 2, t, {
                fontSize: t === '✕' ? '9px' : '8px',
                fontFamily: 'Arial', color: '#FFFFFF', resolution: 2,
            }).setOrigin(0.5, 0.5);
            c.add(txt);
        });

        // ── Hit areas for buttons ──
        // Focus hit (title area)
        const focusHit = this.add.rectangle(w / 2 - 40, TB_H / 2, w - 100, TB_H, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        focusHit.on('pointerdown', () => this.focusWindow(win.id));
        c.add(focusHit);

        // Minimize
        const minHit = this.add.rectangle(minX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        minHit.on('pointerdown', () => this.minimizeWindow(win.id));
        c.add(minHit);

        // Maximize / restore
        const maxHit = this.add.rectangle(maxX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        maxHit.on('pointerdown', () => this.maximizeWindow(win.id));
        c.add(maxHit);

        // Close
        const closeHit = this.add.rectangle(closeX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        closeHit.on('pointerdown', () => this.closeWindow(win.id));
        closeHit.on('pointerover', () => { btnG.clear(); btnG.fillStyle(0xE84040, 1); btnG.fillRoundedRect(closeX, btnY, btnW, btnH, 3); });
        closeHit.on('pointerout',  () => { btnG.clear(); btnG.fillStyle(0xC93033, 1); btnG.fillRoundedRect(closeX, btnY, btnW, btnH, 3); btnG.lineStyle(1, 0xE05858, 1); btnG.strokeRoundedRect(closeX, btnY, btnW, btnH, 3); });
        c.add(closeHit);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DRAWING — LEO PLAYBOOK CHROME
    // ═══════════════════════════════════════════════════════════════════════

    private drawLeoChrome(
        c: Phaser.GameObjects.Container,
        _win: WinConfig,
        b: { w: number; h: number } & { x?: number; y?: number }
    ) {
        const { TB_H, MB_H, TOOL_H, ADDR_H, STAT_H, LEO_SIDEBAR_W } = this;
        const { w, h } = b;
        const g = this.add.graphics();

        // Menu bar
        const menuY = TB_H;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, menuY, w, MB_H);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, menuY + MB_H - 1, w, menuY + MB_H - 1);

        // Toolbar
        const toolY = menuY + MB_H;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, toolY, w, TOOL_H);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, toolY + TOOL_H - 1, w, toolY + TOOL_H - 1);

        // Address bar
        const addrY = toolY + TOOL_H;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, addrY, w, ADDR_H);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, addrY + ADDR_H - 1, w, addrY + ADDR_H - 1);
        // Input field
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(52, addrY + 3, w - 94, ADDR_H - 6);
        g.lineStyle(1, 0x7B9DBB, 1);
        g.strokeRect(52, addrY + 3, w - 94, ADDR_H - 6);
        // Go button
        g.fillStyle(0xDDD9CC, 1);
        g.fillRect(w - 40, addrY + 3, 38, ADDR_H - 6);
        g.lineStyle(1, 0xACA899, 1);
        g.strokeRect(w - 40, addrY + 3, 38, ADDR_H - 6);

        // Content area
        const contentY = addrY + ADDR_H;
        const contentH = h - TB_H - MB_H - TOOL_H - ADDR_H - STAT_H;
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(0, contentY, w, contentH);
        // Sidebar bg
        g.fillStyle(0xF5F5F2, 1);
        g.fillRect(0, contentY, LEO_SIDEBAR_W, contentH);
        // Sidebar border
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(LEO_SIDEBAR_W, contentY, LEO_SIDEBAR_W, contentY + contentH);

        // Sidebar header
        g.fillStyle(0x3E6FAF, 1);
        g.fillRect(0, contentY, LEO_SIDEBAR_W, 22);

        // Status bar
        const statY = contentY + contentH;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, statY, w, STAT_H);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, statY, w, statY);
        // Status panels
        [w - 80, w - 160].forEach(px => {
            g.lineStyle(1, 0xACA899, 1);
            g.lineBetween(px, statY + 2, px, statY + STAT_H - 2);
        });

        c.add(g);

        // ── Text labels ──
        // Menu items
        const menuItems = ['File', 'View', 'Favorites', 'Tools', 'Help'];
        let mx = 8;
        menuItems.forEach(item => {
            const t = this.add.text(mx, menuY + MB_H / 2, item, {
                fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#000000', resolution: 2,
            }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
            t.on('pointerover', () => t.setStyle({ backgroundColor: '#3170D7', color: '#FFF' }));
            t.on('pointerout',  () => t.setStyle({ backgroundColor: undefined, color: '#000000' }));
            c.add(t);
            mx += t.width + 10;
        });

        // Toolbar buttons
        const toolBtns = ['◀ Back', '▶ Forward', '✕ Stop', '↻ Refresh', '⌂ Home'];
        let tx = 6;
        toolBtns.forEach(btn => {
            const t = this.add.text(tx, toolY + TOOL_H / 2, btn, {
                fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#444444', resolution: 2,
            }).setOrigin(0, 0.5);
            c.add(t);
            tx += t.width + 14;
        });

        // Address label + URL
        this.add.text(6,  addrY + ADDR_H / 2, 'Address', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#444444', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0, 0.5); // will be added below

        const addrLabel = this.add.text(6, addrY + ADDR_H / 2, 'Address', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#444444', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0, 0.5);
        const addrUrl = this.add.text(56, addrY + ADDR_H / 2, 'http://lessons.overguild.com/', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#000066', resolution: 2,
        }).setOrigin(0, 0.5);
        const goBtn = this.add.text(w - 22, addrY + ADDR_H / 2, '▶ Go', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#444444', resolution: 2,
        }).setOrigin(0.5, 0.5);
        c.add(addrLabel); c.add(addrUrl); c.add(goBtn);

        // Sidebar header label
        const sideHeader = this.add.text(LEO_SIDEBAR_W / 2, contentY + 11, '📂 Lessons', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#FFFFFF', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0.5, 0.5);
        c.add(sideHeader);

        // Status bar
        const statDone = this.add.text(5, statY + STAT_H / 2, 'Done', {
            fontSize: '7px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#333333', resolution: 2,
        }).setOrigin(0, 0.5);
        c.add(statDone);

        // IE logo on title bar
        const logoG = this.add.graphics();
        logoG.fillStyle(0x1E6BB8, 1);
        logoG.fillCircle(b.w - 70, TB_H / 2, 8);
        logoG.lineStyle(2, 0xFFD700, 1);
        logoG.strokeCircle(b.w - 66, TB_H / 2 + 2, 5);
        c.add(logoG);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DRAWING — NOTEPAD CHROME
    // ═══════════════════════════════════════════════════════════════════════

    private drawNotepadChrome(
        c: Phaser.GameObjects.Container,
        _win: WinConfig,
        b: { w: number; h: number } & { x?: number; y?: number }
    ) {
        const { TB_H, MB_H } = this;
        const { w, h } = b;
        const g = this.add.graphics();

        // Menu bar
        const menuY = TB_H;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, menuY, w, MB_H);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, menuY + MB_H - 1, w, menuY + MB_H - 1);

        // Content background (textarea area)
        const contentY = menuY + MB_H;
        const contentH = h - TB_H - MB_H;
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(0, contentY, w, contentH);
        g.lineStyle(1, 0x808080, 1);
        g.strokeRect(0, contentY, w, contentH);

        c.add(g);

        // Menu items — "File" is functional, others are decorative
        const menuItems = ['File', 'Edit', 'Format', 'View', 'Help'];
        let mx = 8;
        menuItems.forEach(item => {
            const t = this.add.text(mx, menuY + MB_H / 2, item, {
                fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#000000', resolution: 2,
            }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
            t.on('pointerover', () => t.setStyle({ backgroundColor: '#3170D7', color: '#FFF' }));
            t.on('pointerout',  () => t.setStyle({ backgroundColor: undefined, color: '#000000' }));
            if (item === 'File') {
                t.on('pointerdown', () => this.showNotepadFileMenu());
            }
            c.add(t);
            mx += t.width + 10;
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // My Documents chrome (Phaser graphics only — file list is HTML)
    // ─────────────────────────────────────────────────────────────────────
    private drawMyDocsChrome(
        c: Phaser.GameObjects.Container,
        b: { w: number; h: number } & { x?: number; y?: number }
    ) {
        const { TB_H, MB_H } = this;
        const { w, h } = b;
        const TOOL_H2 = 26;
        const ADDR_H2 = 22;
        const STAT_H2 = 18;
        const g = this.add.graphics();

        // Toolbar
        const toolY = TB_H;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, toolY, w, TOOL_H2);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, toolY + TOOL_H2 - 1, w, toolY + TOOL_H2 - 1);

        // Address bar
        const addrY = toolY + TOOL_H2;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, addrY, w, ADDR_H2);
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(52, addrY + 3, w - 60, ADDR_H2 - 6);
        g.lineStyle(1, 0x7B9DBB, 1);
        g.strokeRect(52, addrY + 3, w - 60, ADDR_H2 - 6);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, addrY + ADDR_H2 - 1, w, addrY + ADDR_H2 - 1);

        // File list area (tree on left, list on right)
        const TREE_W = 140;
        const listY = addrY + ADDR_H2;
        const listH  = h - TB_H - TOOL_H2 - ADDR_H2 - STAT_H2;
        g.fillStyle(0xF5F5F2, 1);
        g.fillRect(0, listY, TREE_W, listH);
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(TREE_W, listY, w - TREE_W, listH);
        g.lineStyle(1, 0xACA899, 1);
        g.strokeRect(0, listY, w, listH);
        g.lineBetween(TREE_W, listY, TREE_W, listY + listH);

        // Status bar
        const statY = listY + listH;
        g.fillStyle(0xECE9D8, 1);
        g.fillRect(0, statY, w, STAT_H2);
        g.lineStyle(1, 0xACA899, 1);
        g.lineBetween(0, statY, w, statY);
        c.add(g);

        // Toolbar text
        ['◀ Back', '▶ Forward', '⬆ Up', '🔍 Search', '📁 Folders'].forEach((btn, i) => {
            const t = this.add.text(8 + i * 70, toolY + TOOL_H2 / 2, btn, {
                fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#333333', resolution: 2,
            }).setOrigin(0, 0.5);
            c.add(t);
        });

        // Address bar label + path
        const addrLbl = this.add.text(6,  addrY + ADDR_H2 / 2, 'Address', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#444444', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0, 0.5);
        const addrPath = this.add.text(56, addrY + ADDR_H2 / 2, 'C:\\My Documents', {
            fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#000066', resolution: 2,
        }).setOrigin(0, 0.5);
        c.add(addrLbl); c.add(addrPath);

        // Status bar text (will be updated by HTML)
        const statTxt = this.add.text(5, statY + STAT_H2 / 2, '0 object(s)', {
            fontSize: '7px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#333333', resolution: 2,
        }).setOrigin(0, 0.5);
        c.add(statTxt);

        // Store reference to update status text later
        c.setData('statTxt', statTxt);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HTML OVERLAY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    private createLeoHtml() {
        const { sx, sy } = this.canvasScale();

        // Inject CSS into <head> so it applies regardless of DOM position
        if (!document.getElementById('leo-sidebar-css')) {
            const s = document.createElement('style');
            s.id = 'leo-sidebar-css';
            s.textContent = `
                #leo-sidebar { display:none; flex-direction:column; overflow:hidden;
                    position:fixed; background:#F5F5F2; box-sizing:border-box; z-index:10100;
                    font-family:Tahoma,Arial,sans-serif; }
                #leo-sidebar.visible { display:flex !important; }
                #leo-search-wrap { flex-shrink:0; background:#DDD9CC; border-bottom:1px solid #ACA899;
                    padding:4px; }
                #leo-search-input { width:100%; box-sizing:border-box; border:1px solid #9E9E9E;
                    padding:3px 5px; font-family:Tahoma,Arial,sans-serif; outline:none;
                    background:#FFF; color:#000; }
                #leo-search-input:focus { border-color:#3170D7; }
                #leo-tree-wrap { flex:1; overflow-y:auto; overflow-x:hidden; }
                .leo-grp-hdr { display:flex; align-items:center; gap:3px; padding:4px 5px 4px 4px;
                    cursor:pointer; user-select:none; background:#E8E4DB;
                    border-bottom:1px solid #CAC6BC; font-weight:bold; color:#003366; }
                .leo-grp-hdr:hover { background:#D4D0C8; }
                .leo-grp-arrow { display:inline-block; width:10px; font-size:0.65em;
                    transition:transform 0.15s; flex-shrink:0; text-align:center; }
                .leo-grp-arrow.open { transform:rotate(90deg); }
                .leo-grp-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .leo-grp-count { font-size:0.8em; color:#666; font-weight:normal; margin-left:4px; }
                .leo-grp-items { background:#F5F5F2; }
                .leo-lesson { display:flex; flex-direction:column; padding:3px 6px 3px 16px;
                    cursor:pointer; border-left:3px solid transparent;
                    border-bottom:1px solid #EEEAE0; color:#222; line-height:1.25; }
                .leo-lesson:hover { background:#D0E4F8; border-left-color:#3170D7; }
                .leo-lesson.active { background:#C5DCF5; border-left-color:#003BBC; font-weight:bold; }
                .leo-lesson-title { display:block; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap; color:#111; }
                .leo-lesson-date { font-size:0.78em; color:#888; margin-top:1px; }
                .leo-badge { background:#003BBC; color:#fff; padding:0 3px;
                    border-radius:2px; font-size:0.72em; font-weight:bold; margin-right:3px; }
                .leo-msg { text-align:center; color:#888; padding:12px 6px; }`;
            document.head.appendChild(s);
        }

        // ── Sidebar container ─────────────────────────────────────────────────
        this.leoListEl = document.createElement('div');
        this.leoListEl.id = 'leo-sidebar';
        this.leoListEl.style.fontSize = `${8 * sy}px`;
        this.leoListEl.innerHTML = `
            <div id="leo-search-wrap">
                <input id="leo-search-input" type="text" placeholder="🔍 Search lessons…"
                    style="font-size:${8*sy}px;" />
            </div>
            <div id="leo-tree-wrap"><div class="leo-msg">Loading…</div></div>`;
        document.body.appendChild(this.leoListEl);

        document.getElementById('leo-search-input')!.addEventListener('input', (e) => {
            this.leoFilter = (e.target as HTMLInputElement).value.trim().toLowerCase();
            this.renderLeoSidebar();
        });

        // ── Content area ─────────────────────────────────────────────────────
        if (!document.getElementById('leo-content-css')) {
            const s2 = document.createElement('style');
            s2.id = 'leo-content-css';
            s2.textContent = `
                .xp-md { line-height:1.6; color:#222; }
                .xp-md h1 { font-size:1.4em; color:#003BBC; border-bottom:1px solid #DDEEFF; padding-bottom:3px; margin:10px 0 6px; }
                .xp-md h2 { font-size:1.2em; color:#003BBC; margin:8px 0 4px; }
                .xp-md h3 { font-size:1.05em; color:#1A4FAA; margin:6px 0 3px; }
                .xp-md p  { margin:5px 0; }
                .xp-md code { font-family:'Courier New',monospace; background:#F0F0F0; border:1px solid #DDD; padding:1px 4px; border-radius:2px; font-size:0.9em; }
                .xp-md pre  { background:#F8F8F8; border:1px solid #DDD; padding:8px; overflow-x:auto; border-radius:3px; margin:6px 0; }
                .xp-md pre code { background:none; border:none; padding:0; }
                .xp-md ul,.xp-md ol { padding-left:18px; margin:4px 0; }
                .xp-md li { margin:2px 0; }
                .xp-md a  { color:#0000CC; }
                .xp-md blockquote { border-left:3px solid #AACCEE; margin:6px 0; padding:4px 10px; background:#F0F5FF; color:#444; }
                .xp-md hr { border:none; border-top:1px solid #DDD; margin:8px 0; }
                .xp-md table { border-collapse:collapse; width:100%; margin:6px 0; }
                .xp-md th { background:#3170D7; color:#FFF; padding:3px 6px; text-align:left; }
                .xp-md td { padding:3px 6px; border:1px solid #DDD; }
                .xp-md tr:nth-child(even) td { background:#F0F5FF; }
                .xp-placeholder { text-align:center; color:#999; padding:24px 12px; }`;
            document.head.appendChild(s2);
        }

        this.leoContentEl = document.createElement('div');
        this.leoContentEl.style.cssText = `
            position:fixed; overflow-y:auto; overflow-x:hidden; display:none;
            font-family:Tahoma,Arial,sans-serif; font-size:${9 * sy}px;
            background:#FFFFFF; box-sizing:border-box; z-index:10100;
            padding:${10 * sy}px ${14 * sx}px;`;
        this.leoContentEl.innerHTML = '<div class="xp-placeholder">Select a lesson on the left…</div>';
        document.body.appendChild(this.leoContentEl);
    }

    /** Extract group name from lesson slug/title. */
    private getLessonGroup(lesson: LessonSummary): string {
        // Match patterns: week-1, chapter-2, session-3, module-4, day-5, unit-6, part-7
        const fromSlug = lesson.slug.match(/^(week|chapter|session|module|day|unit|part|lesson)[-_]?(\d+)/i);
        if (fromSlug) {
            const word = fromSlug[1][0].toUpperCase() + fromSlug[1].slice(1).toLowerCase();
            return `${word} ${fromSlug[2]}`;
        }
        const fromTitle = lesson.title.match(/^(week|chapter|session|module|day|unit|part|lesson)\s*(\d+)/i);
        if (fromTitle) {
            const word = fromTitle[1][0].toUpperCase() + fromTitle[1].slice(1).toLowerCase();
            return `${word} ${fromTitle[2]}`;
        }
        return 'Lessons';
    }

    private renderLeoSidebar() {
        if (!this.leoListEl) return;
        const wrap = document.getElementById('leo-tree-wrap');
        if (!wrap) return;

        const q = this.leoFilter;
        const filtered = q
            ? this.leoLessons.filter(l =>
                l.title.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q))
            : this.leoLessons;

        if (this.leoLessons.length > 0 && filtered.length === 0) {
            wrap.innerHTML = '<div class="leo-msg">No lessons match.</div>';
            return;
        }

        // Build group map (preserve insertion order)
        const groupMap = new Map<string, LessonSummary[]>();
        filtered.forEach(l => {
            const g = this.getLessonGroup(l);
            if (!groupMap.has(g)) groupMap.set(g, []);
            groupMap.get(g)!.push(l);
        });

        // Auto-expand everything while searching
        if (q) groupMap.forEach((_, g) => this.leoCollapsed.delete(g));

        // Build DOM directly (avoids innerHTML parsing issues)
        wrap.innerHTML = '';
        let isFirstLesson = true;

        groupMap.forEach((lessons, groupName) => {
            const isOpen = !this.leoCollapsed.has(groupName);

            // ── Group header ──
            const hdr = document.createElement('div');
            hdr.className = 'leo-grp-hdr';
            hdr.dataset.group = groupName;
            hdr.innerHTML = `
                <span class="leo-grp-arrow ${isOpen ? 'open' : ''}">▶</span>
                <span class="leo-grp-label">📂 ${groupName}</span>
                <span class="leo-grp-count">(${lessons.length})</span>`;
            wrap.appendChild(hdr);

            // ── Group items ──
            const grpDiv = document.createElement('div');
            grpDiv.className = 'leo-grp-items';
            grpDiv.dataset.groupItems = groupName;
            grpDiv.style.display = isOpen ? 'block' : 'none';

            lessons.forEach(l => {
                const item = document.createElement('div');
                item.className = 'leo-lesson' + (l.slug === this.leoActiveSlug ? ' active' : '');
                item.dataset.slug = l.slug;
                const badge = isFirstLesson && !q ? '<span class="leo-badge">NEW</span>' : '';
                const date  = l.updatedAt
                    ? new Date(l.updatedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                    : '';
                item.innerHTML = `
                    <span class="leo-lesson-title">${badge}${l.title}</span>
                    ${date ? `<span class="leo-lesson-date">${date}</span>` : ''}`;
                item.addEventListener('click', () => this.loadLesson(l.slug));
                grpDiv.appendChild(item);
                isFirstLesson = false;
            });

            wrap.appendChild(grpDiv);

            // Toggle collapse on header click
            hdr.addEventListener('click', () => {
                const arrow = hdr.querySelector<HTMLElement>('.leo-grp-arrow')!;
                if (this.leoCollapsed.has(groupName)) {
                    this.leoCollapsed.delete(groupName);
                    arrow.classList.add('open');
                    grpDiv.style.display = 'block';
                } else {
                    this.leoCollapsed.add(groupName);
                    arrow.classList.remove('open');
                    grpDiv.style.display = 'none';
                }
            });
        });
    }

    private createNotepadHtml() {
        const { sx, sy } = this.canvasScale();

        const saved = localStorage.getItem(this.NOTEPAD_KEY) ?? '';
        this.notepadTextEl = document.createElement('textarea');
        this.notepadTextEl.value = saved;
        this.notepadTextEl.spellcheck = false;
        this.notepadTextEl.style.cssText = `
            position:fixed; z-index:10100; display:none;
            font-family:'Courier New',Courier,monospace; font-size:${9 * sy}px;
            background:#FFFFFF; color:#000000; border:none; outline:none;
            padding:${6 * sy}px ${8 * sx}px; resize:none; box-sizing:border-box;`;
        this.notepadTextEl.addEventListener('input', () => {
            localStorage.setItem(this.NOTEPAD_KEY, this.notepadTextEl!.value);
        });
        document.body.appendChild(this.notepadTextEl);
    }

    private createMyDocsHtml() {
        const { sy } = this.canvasScale();

        // Left: folder tree panel
        this.myDocsTreeEl = document.createElement('div');
        this.myDocsTreeEl.style.cssText = `
            position:fixed; z-index:10100; display:none;
            background:#F5F5F2; overflow-y:auto; overflow-x:hidden;
            font-family:Tahoma,Arial,sans-serif; font-size:${9 * sy}px;
            box-sizing:border-box;`;
        this.myDocsTreeEl.innerHTML = `<style>
            .tr-node { display:flex; align-items:center; gap:3px; padding:2px 4px; cursor:pointer; white-space:nowrap; user-select:none; border-radius:2px; }
            .tr-node:hover { background:#D0E4F8; }
            .tr-node.active { background:#C5DCF5; font-weight:bold; }
            .tr-toggle { width:10px; text-align:center; font-size:0.75em; flex-shrink:0; color:#666; }
            .tr-icon { flex-shrink:0; }
            .tr-label { overflow:hidden; text-overflow:ellipsis; color:#000; }
        </style>`;
        document.body.appendChild(this.myDocsTreeEl);

        // Right: file list panel
        this.myDocsListEl = document.createElement('div');
        this.myDocsListEl.style.cssText = `
            position:fixed; z-index:10100; display:none;
            background:#FFFFFF; overflow-y:auto; overflow-x:hidden;
            font-family:Tahoma,Arial,sans-serif; font-size:${9 * sy}px;
            box-sizing:border-box;`;
        this.myDocsListEl.innerHTML = `<style>
            .fd-row { display:flex; align-items:center; padding:4px 8px; cursor:pointer; gap:6px; border-bottom:1px solid #F0F0F0; user-select:none; }
            .fd-row:hover { background:#D0E4F8; }
            .fd-row.drag-over { outline:2px dashed #3170D7; background:#EBF3FF; }
            .fd-icon { font-size:1.3em; flex-shrink:0; }
            .fd-name { font-weight:bold; color:#000066; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .fd-date { color:#888; font-size:0.85em; white-space:nowrap; }
            .fd-empty { text-align:center; color:#888; padding:24px 12px; }
        </style>`;
        document.body.appendChild(this.myDocsListEl);
    }

    /** Reposition and show/hide all HTML elements based on current window states. */
    private updateAllHtml() {
        this.updateLeoHtml();
        this.updateNotepadHtml();
        this.updateMyDocsHtml();
    }

    private updateLeoHtml() {
        if (!this.leoListEl || !this.leoContentEl) return;
        const win = this.wins.get('leo')!;

        if (!win.open || win.state === 'minimized') {
            this.leoListEl.classList.remove('visible');
            this.leoContentEl.style.display = 'none';
            return;
        }

        const { TB_H, MB_H, TOOL_H, ADDR_H, STAT_H, LEO_SIDEBAR_W } = this;
        const b = this.getWinBounds(win);
        const { sx, sy, rect } = this.canvasScale();

        const contentY = b.y + TB_H + MB_H + TOOL_H + ADDR_H;
        const contentH = b.h - TB_H - MB_H - TOOL_H - ADDR_H - STAT_H;

        // Sidebar
        this.leoListEl.classList.add('visible');
        this.leoListEl.style.left   = `${rect.left + b.x * sx}px`;
        this.leoListEl.style.top    = `${rect.top + (contentY + 22) * sy}px`; // 22 = sidebar header
        this.leoListEl.style.width  = `${LEO_SIDEBAR_W * sx}px`;
        this.leoListEl.style.height = `${(contentH - 22) * sy}px`;

        // Main content
        this.leoContentEl.style.display = 'block';
        this.leoContentEl.style.left    = `${rect.left + (b.x + LEO_SIDEBAR_W + 1) * sx}px`;
        this.leoContentEl.style.top     = `${rect.top + contentY * sy}px`;
        this.leoContentEl.style.width   = `${(b.w - LEO_SIDEBAR_W - 1) * sx}px`;
        this.leoContentEl.style.height  = `${contentH * sy}px`;
    }

    private updateNotepadHtml() {
        if (!this.notepadTextEl) return;
        const win = this.wins.get('notepad')!;

        if (!win.open || win.state === 'minimized') {
            this.notepadTextEl.style.display = 'none';
            return;
        }

        const { TB_H, MB_H } = this;
        const b = this.getWinBounds(win);
        const { sx, sy, rect } = this.canvasScale();

        const contentY = b.y + TB_H + MB_H;
        const contentH = b.h - TB_H - MB_H;

        this.notepadTextEl.style.display = 'block';
        this.notepadTextEl.style.left    = `${rect.left + (b.x + 1) * sx}px`;
        this.notepadTextEl.style.top     = `${rect.top + contentY * sy}px`;
        this.notepadTextEl.style.width   = `${(b.w - 2) * sx}px`;
        this.notepadTextEl.style.height  = `${contentH * sy}px`;
    }

    private updateMyDocsHtml() {
        if (!this.myDocsTreeEl || !this.myDocsListEl) return;
        const win = this.wins.get('mydocs')!;

        if (!win.open || win.state === 'minimized') {
            this.myDocsTreeEl.style.display = 'none';
            this.myDocsListEl.style.display = 'none';
            return;
        }

        const TOOL_H2 = 26, ADDR_H2 = 22, STAT_H2 = 18;
        const TREE_W  = 140; // game coords
        const b = this.getWinBounds(win);
        const { sx, sy, rect } = this.canvasScale();

        const listY = b.y + this.TB_H + TOOL_H2 + ADDR_H2;
        const listH  = b.h - this.TB_H - TOOL_H2 - ADDR_H2 - STAT_H2;

        // Left tree panel
        this.myDocsTreeEl.style.display = 'block';
        this.myDocsTreeEl.style.left    = `${rect.left + (b.x + 1) * sx}px`;
        this.myDocsTreeEl.style.top     = `${rect.top + listY * sy}px`;
        this.myDocsTreeEl.style.width   = `${(TREE_W - 1) * sx}px`;
        this.myDocsTreeEl.style.height  = `${listH * sy}px`;
        this.myDocsTreeEl.style.fontSize = `${9 * sy}px`;

        // Right list panel
        this.myDocsListEl.style.display = 'block';
        this.myDocsListEl.style.left    = `${rect.left + (b.x + TREE_W + 1) * sx}px`;
        this.myDocsListEl.style.top     = `${rect.top + listY * sy}px`;
        this.myDocsListEl.style.width   = `${(b.w - TREE_W - 2) * sx}px`;
        this.myDocsListEl.style.height  = `${listH * sy}px`;
        this.myDocsListEl.style.fontSize = `${9 * sy}px`;

        this.refreshMyDocs();
    }

    private refreshMyDocs() {
        this.refreshMyDocsTree();
        this.refreshMyDocsList();
        // Update status bar
        const win = this.wins.get('mydocs')!;
        const statTxt = win.container?.getData('statTxt') as Phaser.GameObjects.Text | undefined;
        const children = this.fsChildren(this.myDocsFolderId);
        if (statTxt?.active) statTxt.setText(`${children.length} object(s)`);
    }

    private refreshMyDocsTree() {
        if (!this.myDocsTreeEl) return;

        // Keep the <style> tag, clear everything else
        const styleEl = this.myDocsTreeEl.querySelector('style');
        this.myDocsTreeEl.innerHTML = '';
        if (styleEl) this.myDocsTreeEl.appendChild(styleEl);

        const fs = this.getFs();

        const buildNode = (id: string | null, label: string, icon: string, depth: number, parentWrap: HTMLElement) => {
            const isRoot   = id === null;
            const nodeId   = isRoot ? '__root__' : id!;
            const isActive = this.myDocsFolderId === id;
            const children = fs.filter(i => i.type === 'folder' && i.parentId === id);
            const hasKids  = children.length > 0;
            const collapsed = this.myDocsTreeCollapsed.has(nodeId);

            // Row
            const row = document.createElement('div');
            row.className = 'tr-node' + (isActive ? ' active' : '');
            row.dataset.id = nodeId;
            row.style.paddingLeft = `${4 + depth * 12}px`;

            // Arrow (toggle collapse) — only shown when has children
            const arrow = document.createElement('span');
            arrow.className = 'tr-toggle';
            if (hasKids) {
                arrow.textContent = collapsed ? '▶' : '▼';
                arrow.style.cursor = 'pointer';
                arrow.style.color  = '#555';
            } else {
                arrow.textContent = ' ';
            }

            const iconSpan  = document.createElement('span');
            iconSpan.className = 'tr-icon';
            iconSpan.textContent = icon;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'tr-label';
            labelSpan.textContent = label;
            labelSpan.style.cursor = 'pointer';

            row.appendChild(arrow);
            row.appendChild(iconSpan);
            row.appendChild(labelSpan);
            parentWrap.appendChild(row);

            // Child container
            const childWrap = document.createElement('div');
            childWrap.style.display = collapsed ? 'none' : 'block';
            parentWrap.appendChild(childWrap);

            // Arrow click: toggle collapse (don't navigate)
            if (hasKids) {
                arrow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.myDocsTreeCollapsed.has(nodeId)) {
                        this.myDocsTreeCollapsed.delete(nodeId);
                        arrow.textContent = '▼';
                        childWrap.style.display = 'block';
                    } else {
                        this.myDocsTreeCollapsed.add(nodeId);
                        arrow.textContent = '▶';
                        childWrap.style.display = 'none';
                    }
                    // Update active styling only
                    this.myDocsTreeEl!.querySelectorAll('.tr-node').forEach(n =>
                        n.classList.toggle('active', (n as HTMLElement).dataset.id === (this.myDocsFolderId ?? '__root__'))
                    );
                });
            }

            // Label/row click: navigate into folder
            labelSpan.addEventListener('click', () => {
                this.myDocsBackStack.push(this.myDocsFolderId);
                this.myDocsFolderId = id;
                this.refreshMyDocs();
            });

            // Build children recursively
            children.sort((a, b) => a.name.localeCompare(b.name)).forEach(child => {
                buildNode(child.id, child.name, '📁', depth + 1, childWrap);
            });
        };

        buildNode(null, 'My Documents', '🖥️', 0, this.myDocsTreeEl);
    }

    private refreshMyDocsList() {
        if (!this.myDocsListEl) return;
        const style = this.myDocsListEl.querySelector('style')?.outerHTML ?? '';
        const items = this.fsChildren(this.myDocsFolderId);

        if (items.length === 0) {
            this.myDocsListEl.innerHTML = style + '<div class="fd-empty">This folder is empty.</div>';

            // Allow drop onto empty area to move files here
            this.myDocsListEl.addEventListener('dragover', e => e.preventDefault());
            this.myDocsListEl.addEventListener('drop', e => {
                e.preventDefault();
                const id = e.dataTransfer?.getData('text/plain') ?? '';
                if (id) { this.fsMoveItem(id, this.myDocsFolderId); this.refreshMyDocs(); }
            });
            this.attachMyDocsCtxMenu(this.myDocsListEl, null);
            return;
        }

        let html = style;
        items.forEach(item => {
            const icon = item.type === 'folder' ? '📁' : '📄';
            const date = item.savedAt
                ? new Date(item.savedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                : '';
            html += `<div class="fd-row" draggable="true" data-id="${item.id}" data-type="${item.type}">
                <span class="fd-icon">${icon}</span>
                <span class="fd-name">${item.name}${item.type === 'file' ? '.txt' : ''}</span>
                <span class="fd-date">${date}</span>
            </div>`;
        });
        this.myDocsListEl.innerHTML = html;

        this.myDocsListEl.querySelectorAll('.fd-row').forEach(row => {
            const el = row as HTMLElement;
            const id   = el.dataset.id ?? '';
            const type = el.dataset.type as 'file' | 'folder';

            // Double-click: open file or navigate folder
            el.addEventListener('dblclick', () => {
                if (type === 'folder') {
                    this.myDocsBackStack.push(this.myDocsFolderId);
                    this.myDocsFolderId = id;
                    this.refreshMyDocs();
                } else {
                    this.openFileInNotepad(id);
                }
            });

            // Drag to move
            el.addEventListener('dragstart', e => {
                e.dataTransfer?.setData('text/plain', id);
                el.style.opacity = '0.5';
            });
            el.addEventListener('dragend', () => { el.style.opacity = ''; });

            // Drop target (folders only)
            if (type === 'folder') {
                el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
                el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
                el.addEventListener('drop', e => {
                    e.preventDefault(); e.stopPropagation();
                    el.classList.remove('drag-over');
                    const srcId = e.dataTransfer?.getData('text/plain') ?? '';
                    if (srcId && srcId !== id) { this.fsMoveItem(srcId, id); this.refreshMyDocs(); }
                });
            }

            // Right-click context menu
            el.addEventListener('contextmenu', e => {
                e.preventDefault();
                this.showCtxMenu(e.clientX, e.clientY, id, type);
            });
        });

        // Right-click on empty area
        this.attachMyDocsCtxMenu(this.myDocsListEl, null);

        // Drop on empty area
        this.myDocsListEl.addEventListener('dragover', e => e.preventDefault());
        this.myDocsListEl.addEventListener('drop', e => {
            if ((e.target as HTMLElement).classList.contains('fd-row')) return;
            e.preventDefault();
            const srcId = e.dataTransfer?.getData('text/plain') ?? '';
            if (srcId) { this.fsMoveItem(srcId, this.myDocsFolderId); this.refreshMyDocs(); }
        });
    }

    /** Replace a list row's name span with an inline input, commit on Enter/blur. */
    private startInlineRename(itemId: string, isNew = false) {
        if (!this.myDocsListEl) return;

        // Wait a tick for the DOM to settle after refresh
        requestAnimationFrame(() => {
            const row = this.myDocsListEl!.querySelector<HTMLElement>(`.fd-row[data-id="${itemId}"]`);
            if (!row) return;

            const nameSpan = row.querySelector<HTMLElement>('.fd-name');
            if (!nameSpan) return;

            const item = this.fsItem(itemId);
            if (!item) return;

            // Create inline input
            const input = document.createElement('input');
            input.type  = 'text';
            input.value = isNew ? '' : item.name;
            input.placeholder = item.type === 'folder' ? 'New Folder' : 'New File';
            input.style.cssText = `
                flex:1; min-width:0; border:1px solid #3170D7; outline:none;
                padding:1px 3px; font-family:inherit; font-size:inherit;
                background:#FFF; color:#000; box-sizing:border-box;`;

            nameSpan.replaceWith(input);
            input.select();
            input.focus();

            const commit = () => {
                const newName = input.value.trim() || (item.type === 'folder' ? 'New Folder' : 'New File');
                if (newName !== item.name) {
                    this.fsRenameItem(itemId, newName);
                }
                this.refreshMyDocs();
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { this.refreshMyDocs(); }
            });
            input.addEventListener('blur', commit, { once: true });
        });
    }

    private attachMyDocsCtxMenu(el: HTMLElement, _itemId: string | null) {
        el.addEventListener('contextmenu', e => {
            if ((e.target as HTMLElement).closest('.fd-row')) return;
            e.preventDefault();
            this.showCtxMenu(e.clientX, e.clientY, null, null);
        });
    }

    private updateAllHtmlZIndex() {
        const topId = this.focusStack[this.focusStack.length - 1];
        const z = (id: WinId) => topId === id ? 10200 : 10100;
        if (this.leoListEl)     this.leoListEl.style.zIndex       = String(z('leo'));
        if (this.leoContentEl)  this.leoContentEl.style.zIndex   = String(z('leo'));
        if (this.notepadTextEl) this.notepadTextEl.style.zIndex   = String(z('notepad'));
        if (this.myDocsTreeEl)  this.myDocsTreeEl.style.zIndex   = String(z('mydocs'));
        if (this.myDocsListEl)  this.myDocsListEl.style.zIndex   = String(z('mydocs'));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TASKBAR
    // ═══════════════════════════════════════════════════════════════════════

    private buildTaskbar() {
        const W = this.DW;
        const H = this.scale.height;
        const tbH = 40;
        const tbY = H - tbH;

        const g = this.add.graphics().setDepth(500);

        // Silver background
        g.fillStyle(0xD4D0C8, 1);
        g.fillRect(0, tbY, W, tbH);
        g.lineStyle(1, 0xFFFFFF, 1);
        g.lineBetween(0, tbY, W, tbY);

        // Start button
        this.drawStartButton(tbY, tbH);

        // Separator after start
        const sepG = this.add.graphics().setDepth(501);
        sepG.lineStyle(1, 0x808080, 1);
        sepG.lineBetween(88, tbY + 4, 88, H - 4);
        sepG.lineStyle(1, 0xFFFFFF, 1);
        sepG.lineBetween(89, tbY + 4, 89, H - 4);

        // Window buttons area (will be rebuilt by refreshTaskbar)
        this.taskbarWinBtns = this.add.container(94, tbY).setDepth(502);

        // System tray
        this.buildSystemTray(tbY, tbH);
    }

    private drawStartButton(tbY: number, tbH: number) {
        const btnW = 82;
        const btnH = tbH - 6;
        const g = this.add.graphics().setDepth(501);

        for (let px = 0; px < btnW; px++) {
            const t = px / btnW;
            const r  = Math.round(92  - 32 * t);
            const gr = Math.round(171 - 39 * t);
            const b  = Math.round(75  - 37 * t);
            g.fillStyle((r << 16) | (gr << 8) | b, 1);
            g.fillRect(px, tbY + 3, 1, btnH);
        }
        g.lineStyle(1, 0x3A6F1C, 1);
        g.strokeRect(0, tbY + 3, btnW, btnH);

        this.add.text(btnW / 2, tbY + 3 + btnH / 2, '🌿 start', {
            fontSize: '11px', fontFamily: 'Tahoma, Arial, sans-serif',
            color: '#FFFFFF', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0.5, 0.5).setDepth(502);

        const hit = this.add.rectangle(btnW / 2, tbY + 3 + btnH / 2, btnW, btnH, 0x000000, 0)
            .setInteractive({ useHandCursor: true }).setDepth(502);
        hit.on('pointerdown', () => this.toggleStartMenu());
        hit.on('pointerover', () => g.setAlpha(0.85));
        hit.on('pointerout',  () => g.setAlpha(1));
    }

    private buildSystemTray(tbY: number, tbH: number) {
        const W = this.DW;
        const trayX = W - 88;
        const g = this.add.graphics().setDepth(501);

        // Separator
        g.lineStyle(1, 0x808080, 1);
        g.lineBetween(trayX, tbY + 4, trayX, tbY + tbH - 4);
        g.lineStyle(1, 0xFFFFFF, 1);
        g.lineBetween(trayX + 1, tbY + 4, trayX + 1, tbY + tbH - 4);

        // Dark blue tray bg
        for (let px = 0; px < W - trayX - 2; px++) {
            const t = px / (W - trayX - 2);
            const r  = Math.round(10 + 30 * t);
            const gr = Math.round(36 + 60 * t);
            const b  = Math.round(106 + 80 * t);
            g.fillStyle((r << 16) | (gr << 8) | b, 1);
            g.fillRect(trayX + 2 + px, tbY, 1, tbH);
        }

        // Volume icon
        this.add.text(trayX + 8, tbY + tbH / 2, '🔊', {
            fontSize: '11px', resolution: 2,
        }).setOrigin(0, 0.5).setDepth(502);

        // Clock
        this.clockText = this.add.text(W - 6, tbY + tbH / 2, this.nowStr(), {
            fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#FFFFFF', resolution: 2,
        }).setOrigin(1, 0.5).setDepth(502);

        this.time.addEvent({
            delay: 10000, loop: true,
            callback: () => { if (this.clockText?.active) this.clockText.setText(this.nowStr()); },
        });
    }

    private refreshTaskbar() {
        if (!this.taskbarWinBtns) return;
        this.taskbarWinBtns.removeAll(true);

        let bx = 0;
        const btnW = 150;
        const btnH = 30;

        this.wins.forEach((win) => {
            if (!win.open) return;

            const isActive = this.focusStack[this.focusStack.length - 1] === win.id;
            const g = this.add.graphics();
            if (isActive) {
                g.fillStyle(0xBDB9B0, 1);
                g.fillRoundedRect(bx, 5, btnW, btnH, 3);
                g.lineStyle(1, 0x808080, 1);
                g.strokeRoundedRect(bx, 5, btnW, btnH, 3);
            } else {
                g.fillStyle(0xCEC8BC, 1);
                g.fillRoundedRect(bx, 5, btnW, btnH, 3);
                g.lineStyle(1, 0xACA899, 1);
                g.strokeRoundedRect(bx, 5, btnW, btnH, 3);
            }

            const label = this.add.text(bx + 8, 5 + btnH / 2,
                win.state === 'minimized' ? `[${win.title}]` : win.title, {
                    fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif',
                    color: '#000000', resolution: 2,
                }).setOrigin(0, 0.5);

            const hit = this.add.rectangle(bx + btnW / 2, 5 + btnH / 2, btnW, btnH, 0x000000, 0)
                .setInteractive({ useHandCursor: true });
            hit.on('pointerdown', () => {
                if (win.state === 'minimized') {
                    this.restoreWindow(win.id);
                } else if (this.focusStack[this.focusStack.length - 1] === win.id) {
                    this.minimizeWindow(win.id);
                } else {
                    this.focusWindow(win.id);
                }
            });

            this.taskbarWinBtns!.add([g, label, hit]);
            bx += btnW + 4;
        });
    }

    private nowStr(): string {
        return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // START MENU
    // ═══════════════════════════════════════════════════════════════════════

    private toggleStartMenu() {
        this.startMenuOpen ? this.closeStartMenu() : this.openStartMenu();
    }

    private openStartMenu() {
        this.startMenuOpen = true;
        const H = this.scale.height;
        const tbH = 40;
        const menuW = 200;
        const menuH = 230;
        const menuX = 0;
        const menuY = H - tbH - menuH;

        const c = this.add.container(menuX, menuY).setDepth(600);
        this.startMenuContainer = c;

        const g = this.add.graphics();
        // Menu bg (dark blue left strip + white right area)
        g.fillStyle(0x2B5797, 1);
        g.fillRect(0, 0, menuW, menuH);
        // Right panel
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(60, 30, menuW - 60, menuH - 30);
        // Header user area
        g.fillStyle(0x1A3870, 1);
        g.fillRect(0, 0, menuW, 30);
        // Border
        g.lineStyle(1, 0x1A3870, 1);
        g.strokeRect(0, 0, menuW, menuH);
        // Bottom strip
        g.fillStyle(0x2B5797, 1);
        g.fillRect(0, menuH - 28, menuW, 28);
        g.lineStyle(1, 0x4A7EC6, 1);
        g.lineBetween(0, menuH - 28, menuW, menuH - 28);
        c.add(g);

        // User name / branding
        const user = this.add.text(10, 15, '🌿 OverGuild OS', {
            fontSize: '10px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#FFFFFF', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0, 0.5);
        c.add(user);

        // ── App shortcuts ──
        const apps: Array<{ icon: string; label: string; action: () => void }> = [
            { icon: '📚', label: 'Leo Playbook',  action: () => this.openWindow('leo') },
            { icon: '📝', label: 'Notepad',       action: () => this.openWindow('notepad') },
        ];

        apps.forEach(({ icon, label, action }, i) => {
            const itemY = 36 + i * 36;
            const itemBg = this.add.rectangle(menuW / 2 + 30, itemY + 14, menuW - 64, 30, 0x000000, 0)
                .setInteractive({ useHandCursor: true });
            itemBg.on('pointerover', () => itemBg.setFillStyle(0x3170D7, 0.5));
            itemBg.on('pointerout',  () => itemBg.setFillStyle(0x000000, 0));
            itemBg.on('pointerdown', action);
            c.add(itemBg);

            const iconT = this.add.text(66, itemY + 14, icon, {
                fontSize: '16px', resolution: 2,
            }).setOrigin(0, 0.5);
            const labelT = this.add.text(90, itemY + 14, label, {
                fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#000000', resolution: 2,
            }).setOrigin(0, 0.5);
            c.add(iconT); c.add(labelT);
        });

        // Separator
        const sepG = this.add.graphics();
        sepG.lineStyle(1, 0xACA899, 1);
        sepG.lineBetween(62, 30 + apps.length * 36 + 6, menuW - 4, 30 + apps.length * 36 + 6);
        c.add(sepG);

        // Shut Down
        const shutY = menuH - 14;
        const shutBg = this.add.rectangle(menuW / 2, shutY, menuW - 12, 22, 0x000000, 0)
            .setInteractive({ useHandCursor: true });
        shutBg.on('pointerover', () => shutBg.setFillStyle(0x8B1A1A, 0.6));
        shutBg.on('pointerout',  () => shutBg.setFillStyle(0x000000, 0));
        shutBg.on('pointerdown', () => this.closeXP());
        c.add(shutBg);

        const shutBtn = this.add.text(menuW / 2, shutY, '🔴 Shut Down', {
            fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', color: '#FFFFFF', resolution: 2,
        }).setOrigin(0.5, 0.5);
        c.add(shutBtn);

        // ── Click-outside-to-close (scene-level, NOT inside container so it never blocks menu items) ──
        const dismisser = this.add.rectangle(this.DW / 2, this.DH / 2, this.DW, this.DH, 0x000000, 0)
            .setInteractive().setDepth(590);
        dismisser.on('pointerdown', () => { this.closeStartMenu(); dismisser.destroy(); });
        this.startMenuContainer!.setData('dismisser', dismisser);

        // Hide HTML overlays so the start menu (Phaser) is visible on top
        this.setHtmlVisible(false);
    }

    private closeStartMenu() {
        if (!this.startMenuOpen) return;
        this.startMenuOpen = false;

        // Destroy the outside-click dismisser if still alive
        const dismisser = this.startMenuContainer?.getData('dismisser') as Phaser.GameObjects.Rectangle | undefined;
        dismisser?.destroy();

        this.startMenuContainer?.destroy();
        this.startMenuContainer = null;

        // Restore HTML overlays
        this.setHtmlVisible(true);
    }

    /** Show or hide all HTML overlays (used when start menu opens/closes). */
    private setHtmlVisible(visible: boolean) {
        const leo = this.wins.get('leo')!;
        const np  = this.wins.get('notepad')!;
        const md  = this.wins.get('mydocs')!;
        const show = (win: WinConfig) => visible && win.open && win.state !== 'minimized';

        if (this.leoListEl)    this.leoListEl.classList.toggle('visible', show(leo));
        if (this.leoContentEl) this.leoContentEl.style.display = show(leo) ? 'block' : 'none';
        if (this.notepadTextEl) this.notepadTextEl.style.display = show(np) ? 'block' : 'none';
        if (this.myDocsTreeEl) this.myDocsTreeEl.style.display  = show(md) ? 'block' : 'none';
        if (this.myDocsListEl) this.myDocsListEl.style.display  = show(md) ? 'block' : 'none';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DESKTOP (wallpaper + icons)
    // ═══════════════════════════════════════════════════════════════════════

    private drawBliss() {
        const W = this.DW;
        const H = this.DH;
        const g = this.add.graphics().setDepth(0);

        // Sky gradient
        const sky = [
            { t: 0.00, r: 40,  gr: 100, b: 180 },
            { t: 0.30, r: 80,  gr: 148, b: 210 },
            { t: 0.55, r: 138, gr: 195, b: 236 },
            { t: 0.70, r: 185, gr: 225, b: 246 },
        ];
        for (let i = 0; i < sky.length - 1; i++) {
            const b1 = sky[i]; const b2 = sky[i + 1];
            const y1 = Math.round(b1.t * H); const y2 = Math.round(b2.t * H);
            for (let s = 0; s < y2 - y1; s++) {
                const t = s / (y2 - y1);
                const r  = Math.round(b1.r  + (b2.r  - b1.r)  * t);
                const gr = Math.round(b1.gr + (b2.gr - b1.gr) * t);
                const bl = Math.round(b1.b  + (b2.b  - b1.b)  * t);
                g.fillStyle((r << 16) | (gr << 8) | bl, 1);
                g.fillRect(0, y1 + s, W, 1);
            }
        }

        const hY = Math.round(H * 0.60);
        g.fillStyle(0x5C9E28, 1);
        g.fillRect(0, hY, W, H - hY);

        // Background hills
        g.fillStyle(0x4E8A20, 1);
        g.fillPoints([
            { x: 0, y: hY + 25 }, { x: W * 0.25, y: hY - 45 }, { x: W * 0.58, y: hY - 38 },
            { x: W * 0.88, y: hY - 28 }, { x: W, y: hY + 10 }, { x: W, y: H }, { x: 0, y: H },
        ], true);

        // Main Bliss hill
        g.fillStyle(0x6AB52E, 1);
        g.fillPoints([
            { x: 0, y: H }, { x: 0, y: H * 0.76 }, { x: W * 0.28, y: H * 0.64 },
            { x: W * 0.60, y: H * 0.65 }, { x: W, y: H * 0.68 }, { x: W, y: H },
        ], true);

        // Foreground
        g.fillStyle(0x80CF3C, 1);
        g.fillPoints([
            { x: 0, y: H }, { x: 0, y: H * 0.88 }, { x: W * 0.25, y: H * 0.84 },
            { x: W * 0.78, y: H * 0.81 }, { x: W, y: H * 0.85 }, { x: W, y: H },
        ], true);

        // Clouds
        const cloud = (cx: number, cy: number, r: number) => {
            g.fillStyle(0xFFFFFF, 0.92);
            [[0, 0], [r * 0.85, r * 0.1], [-r * 0.75, r * 0.2], [r * 1.55, r * 0.35]]
                .forEach(([dx, dy]) => g.fillCircle(Math.round(cx + dx), Math.round(cy + dy), Math.round(r * (dx === 0 ? 1 : 0.7))));
        };
        cloud(130, 72, 22); cloud(680, 55, 18); cloud(440, 88, 14); cloud(300, 48, 11);
    }

    private drawDesktopIcons() {
        const icons: Array<{ emoji: string; label: string; winId?: WinId }> = [
            { emoji: '🖥️', label: 'My Computer',  winId: 'mydocs' },
            { emoji: '📁', label: 'My Documents', winId: 'mydocs' },
            { emoji: '📚', label: 'Leo Playbook', winId: 'leo' },
            { emoji: '📝', label: 'Notepad',      winId: 'notepad' },
            { emoji: '🗑️', label: 'Recycle Bin' },
        ];

        icons.forEach((icon, i) => {
            const x = 22;
            const y = 18 + i * 58;

            const emojiTxt = this.add.text(x + 16, y, icon.emoji, {
                fontSize: '20px', resolution: 2,
            }).setOrigin(0.5, 0).setDepth(20);

            this.add.text(x + 16, y + 28, icon.label, {
                fontSize: '7px', fontFamily: 'Tahoma,Arial,sans-serif', color: '#FFFFFF',
                shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 1, fill: true },
                resolution: 2, align: 'center', wordWrap: { width: 60 },
            }).setOrigin(0.5, 0).setDepth(20);

            if (icon.winId) {
                const hit = this.add.rectangle(x + 16, y + 22, 44, 48, 0x000000, 0)
                    .setInteractive({ useHandCursor: true }).setDepth(20);
                hit.on('pointerover', () => emojiTxt.setAlpha(0.75));
                hit.on('pointerout',  () => emojiTxt.setAlpha(1));
                hit.on('pointerdown', () => this.openWindow(icon.winId!));
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILE SYSTEM (localStorage, hierarchical FsItem tree)
    // ═══════════════════════════════════════════════════════════════════════

    private uid(): string {
        return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    }

    private getFs(): FsItem[] {
        try { return JSON.parse(localStorage.getItem(this.FS_KEY) ?? '[]'); }
        catch { return []; }
    }

    private saveFs(items: FsItem[]) {
        localStorage.setItem(this.FS_KEY, JSON.stringify(items));
    }

    private fsChildren(parentId: string | null): FsItem[] {
        return this.getFs().filter(i => i.parentId === parentId)
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    }

    private fsItem(id: string): FsItem | undefined {
        return this.getFs().find(i => i.id === id);
    }

    private fsPath(id: string | null): string {
        if (id === null) return 'My Documents';
        const item = this.fsItem(id);
        if (!item) return 'My Documents';
        return this.fsPath(item.parentId) + ' \\ ' + item.name;
    }

    private fsAddFile(name: string, content: string, parentId: string | null): FsItem {
        const fs = this.getFs().filter(f => !(f.type === 'file' && f.name === name && f.parentId === parentId));
        const item: FsItem = { id: this.uid(), type: 'file', name, parentId, content, savedAt: new Date().toISOString() };
        fs.unshift(item);
        this.saveFs(fs);
        return item;
    }

    private fsAddFolder(name: string, parentId: string | null): FsItem {
        const fs = this.getFs();
        const existing = fs.find(f => f.type === 'folder' && f.name === name && f.parentId === parentId);
        if (existing) return existing;
        const item: FsItem = { id: this.uid(), type: 'folder', name, parentId };
        fs.push(item);
        this.saveFs(fs);
        return item;
    }

    private fsDeleteItem(id: string) {
        const deleteRec = (fid: string, arr: FsItem[]): FsItem[] => {
            const children = arr.filter(i => i.parentId === fid);
            let rest = arr.filter(i => i.id !== fid);
            children.forEach(c => { rest = deleteRec(c.id, rest); });
            return rest;
        };
        this.saveFs(deleteRec(id, this.getFs()));
    }

    private fsMoveItem(id: string, newParentId: string | null) {
        const fs = this.getFs();
        const idx = fs.findIndex(i => i.id === id);
        if (idx < 0) return;
        fs[idx] = { ...fs[idx], parentId: newParentId };
        this.saveFs(fs);
    }

    private fsRenameItem(id: string, newName: string) {
        const fs = this.getFs();
        const idx = fs.findIndex(i => i.id === id);
        if (idx < 0) return;
        fs[idx] = { ...fs[idx], name: newName };
        this.saveFs(fs);
    }

    private openFileInNotepad(id: string) {
        const file = this.fsItem(id);
        if (!file || file.type !== 'file' || !this.notepadTextEl) return;
        const content = file.content ?? '';
        this.notepadFilename = file.name;
        this.notepadFileId   = file.id;
        this.notepadTextEl.value = content;
        localStorage.setItem(this.NOTEPAD_KEY, content);
        const win = this.wins.get('notepad')!;
        win.title = `📝 ${file.name} - Notepad`;
        this.openWindow('notepad');
        this.renderWindow('notepad');
        this.updateNotepadHtml();
    }

    // ─── Save / Open dialog ──────────────────────────────────────────────────

    private showSaveDialog() {
        this.closeDialog();
        let dialogFolderId: string | null = this.myDocsFolderId;

        const render = () => {
            if (!this.dialogEl) return;
            const { sx, sy, rect } = this.canvasScale();
            const DW = 320 * sx, DH = 240 * sy;
            const screenX = rect.left + rect.width / 2 - DW / 2;
            const screenY = rect.top + rect.height / 2 - DH / 2;

            const items = this.fsChildren(dialogFolderId);
            const path  = this.fsPath(dialogFolderId);

            let rowsHtml = items.map(item => {
                const icon = item.type === 'folder' ? '📁' : '📄';
                return `<div class="dlg-row" data-id="${item.id}" data-type="${item.type}" style="display:flex;align-items:center;gap:6px;padding:3px 6px;cursor:pointer;">
                    <span>${icon}</span><span>${item.name}${item.type==='file'?'.txt':''}</span>
                </div>`;
            }).join('');
            if (!rowsHtml) rowsHtml = `<div style="color:#888;text-align:center;padding:12px;">Empty</div>`;

            this.dialogEl!.innerHTML = `
                <style>
                    .dlg-row:hover{background:#D0E4F8;}
                    .dlg-row.selected{background:#C5DCF5;}
                    .dlg-tb{background:linear-gradient(to bottom,#0038C8,#1A56D6);color:#FFF;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:${10*sy}px;border-radius:4px 4px 0 0;cursor:move;}
                    .dlg-close{cursor:pointer;background:#C93033;border:none;color:#FFF;padding:1px 5px;border-radius:3px;font-size:${10*sy}px;}
                </style>
                <div class="dlg-tb"><span>Save As</span><button class="dlg-close">✕</button></div>
                <div style="padding:${6*sy}px ${8*sx}px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #ccc;font-size:${9*sy}px;">
                    <span style="color:#444;">Look in:</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#000066;">${path}</span>
                    ${dialogFolderId !== null ? `<button id="dlg-up" style="font-size:${9*sy}px;cursor:pointer;padding:1px 6px;">⬆ Up</button>` : ''}
                </div>
                <div id="dlg-list" style="height:${110*sy}px;overflow-y:auto;background:#FFF;border-bottom:1px solid #ccc;font-size:${9*sy}px;">${rowsHtml}</div>
                <div style="padding:${5*sy}px ${8*sx}px;display:flex;align-items:center;gap:6px;font-size:${9*sy}px;">
                    <label>File name:</label>
                    <input id="dlg-fname" value="${this.notepadFilename === 'Untitled' ? '' : this.notepadFilename}"
                        style="flex:1;font-size:${9*sy}px;padding:2px 4px;border:1px solid #999;">
                </div>
                <div style="display:flex;justify-content:flex-end;gap:6px;padding:${4*sy}px ${8*sx}px;">
                    <button id="dlg-save" style="font-size:${9*sy}px;padding:3px 14px;cursor:pointer;background:#0038C8;color:#FFF;border:none;border-radius:3px;">Save</button>
                    <button id="dlg-cancel" style="font-size:${9*sy}px;padding:3px 14px;cursor:pointer;">Cancel</button>
                </div>`;

            this.dialogEl!.style.cssText = `
                position:fixed;left:${screenX}px;top:${screenY}px;
                width:${DW}px;background:#ECE9D8;
                border:2px solid #0038C8;border-radius:4px;
                box-shadow:4px 4px 12px rgba(0,0,0,0.4);
                z-index:30000;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;`;

            // Events
            this.dialogEl!.querySelector('.dlg-close')!.addEventListener('click', () => this.closeDialog());
            this.dialogEl!.querySelector('#dlg-cancel')!.addEventListener('click', () => this.closeDialog());

            const upBtn = this.dialogEl!.querySelector('#dlg-up');
            if (upBtn) {
                upBtn.addEventListener('click', () => {
                    const item = this.fsItem(dialogFolderId!);
                    dialogFolderId = item?.parentId ?? null;
                    render();
                });
            }

            this.dialogEl!.querySelectorAll('.dlg-row').forEach(row => {
                const el = row as HTMLElement;
                el.addEventListener('click', () => {
                    this.dialogEl!.querySelectorAll('.dlg-row').forEach(r => r.classList.remove('selected'));
                    el.classList.add('selected');
                    if (el.dataset.type === 'file') {
                        const fname = this.dialogEl!.querySelector<HTMLInputElement>('#dlg-fname');
                        if (fname) fname.value = el.textContent?.replace('.txt','').trim() ?? '';
                    }
                });
                el.addEventListener('dblclick', () => {
                    if (el.dataset.type === 'folder') {
                        dialogFolderId = el.dataset.id!;
                        render();
                    }
                });
            });

            this.dialogEl!.querySelector('#dlg-save')!.addEventListener('click', () => {
                const fname = (this.dialogEl!.querySelector<HTMLInputElement>('#dlg-fname')?.value ?? '').trim();
                if (!fname) return;
                this.closeDialog();
                this.persistNotepadFile(fname, dialogFolderId);
            });
        };

        this.dialogEl = document.createElement('div');
        document.body.appendChild(this.dialogEl);
        render();
    }

    private showOpenDialog() {
        this.closeDialog();
        let dialogFolderId: string | null = null;

        const render = () => {
            if (!this.dialogEl) return;
            const { sx, sy, rect } = this.canvasScale();
            const DW = 300 * sx;
            const DH2 = 220 * sy;
            const screenX = rect.left + rect.width / 2 - DW / 2;
            const screenY = rect.top + rect.height / 2 - DH2 / 2;

            const items = this.fsChildren(dialogFolderId);
            const path  = this.fsPath(dialogFolderId);

            let rowsHtml = items.map(item => {
                const icon = item.type === 'folder' ? '📁' : '📄';
                return `<div class="dlg-row" data-id="${item.id}" data-type="${item.type}" style="display:flex;align-items:center;gap:6px;padding:3px 6px;cursor:pointer;">
                    <span>${icon}</span><span>${item.name}${item.type==='file'?'.txt':''}</span>
                </div>`;
            }).join('');
            if (!rowsHtml) rowsHtml = `<div style="color:#888;text-align:center;padding:12px;">Empty</div>`;

            this.dialogEl!.innerHTML = `
                <style>.dlg-row:hover{background:#D0E4F8;}.dlg-row.selected{background:#C5DCF5;}
                .dlg-tb{background:linear-gradient(to bottom,#0038C8,#1A56D6);color:#FFF;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:${10*sy}px;border-radius:4px 4px 0 0;}
                .dlg-close{cursor:pointer;background:#C93033;border:none;color:#FFF;padding:1px 5px;border-radius:3px;font-size:${10*sy}px;}</style>
                <div class="dlg-tb"><span>Open</span><button class="dlg-close">✕</button></div>
                <div style="padding:${5*sy}px ${8*sx}px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #ccc;font-size:${9*sy}px;">
                    <span style="color:#444;">Look in:</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#000066;">${path}</span>
                    ${dialogFolderId !== null ? `<button id="dlg-up" style="font-size:${9*sy}px;cursor:pointer;padding:1px 6px;">⬆ Up</button>` : ''}
                </div>
                <div id="dlg-list" style="height:${110*sy}px;overflow-y:auto;background:#FFF;border-bottom:1px solid #ccc;font-size:${9*sy}px;">${rowsHtml}</div>
                <div style="display:flex;justify-content:flex-end;gap:6px;padding:${5*sy}px ${8*sx}px;">
                    <button id="dlg-open" style="font-size:${9*sy}px;padding:3px 14px;cursor:pointer;background:#0038C8;color:#FFF;border:none;border-radius:3px;">Open</button>
                    <button id="dlg-cancel" style="font-size:${9*sy}px;padding:3px 14px;cursor:pointer;">Cancel</button>
                </div>`;

            this.dialogEl!.style.cssText = `
                position:fixed;left:${screenX}px;top:${screenY}px;
                width:${DW}px;background:#ECE9D8;
                border:2px solid #0038C8;border-radius:4px;
                box-shadow:4px 4px 12px rgba(0,0,0,0.4);
                z-index:30000;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;`;

            this.dialogEl!.querySelector('.dlg-close')!.addEventListener('click', () => this.closeDialog());
            this.dialogEl!.querySelector('#dlg-cancel')!.addEventListener('click', () => this.closeDialog());

            const upBtn = this.dialogEl!.querySelector('#dlg-up');
            if (upBtn) {
                upBtn.addEventListener('click', () => {
                    const item = this.fsItem(dialogFolderId!);
                    dialogFolderId = item?.parentId ?? null;
                    render();
                });
            }

            let selectedId: string | null = null;
            this.dialogEl!.querySelectorAll('.dlg-row').forEach(row => {
                const el = row as HTMLElement;
                el.addEventListener('click', () => {
                    this.dialogEl!.querySelectorAll('.dlg-row').forEach(r => r.classList.remove('selected'));
                    el.classList.add('selected');
                    if (el.dataset.type === 'file') selectedId = el.dataset.id!;
                });
                el.addEventListener('dblclick', () => {
                    if (el.dataset.type === 'folder') {
                        dialogFolderId = el.dataset.id!;
                        selectedId = null;
                        render();
                    } else if (el.dataset.id) {
                        this.closeDialog();
                        this.openFileInNotepad(el.dataset.id);
                    }
                });
            });

            this.dialogEl!.querySelector('#dlg-open')!.addEventListener('click', () => {
                if (selectedId) { this.closeDialog(); this.openFileInNotepad(selectedId); }
            });
        };

        this.dialogEl = document.createElement('div');
        document.body.appendChild(this.dialogEl);
        render();
    }

    private closeDialog() {
        this.dialogEl?.remove();
        this.dialogEl = null;
    }

    // ─── Context menu ─────────────────────────────────────────────────────────

    private showCtxMenu(x: number, y: number, itemId: string | null, itemType: 'file' | 'folder' | null) {
        this.hideCtxMenu();
        const { sy } = this.canvasScale();
        const menu = document.createElement('div');
        menu.style.cssText = `
            position:fixed;left:${x}px;top:${y}px;
            min-width:${130}px;background:#FFFFFF;
            border:1px solid #808080;box-shadow:2px 2px 5px rgba(0,0,0,0.3);
            z-index:30000;font-family:Tahoma,Arial,sans-serif;font-size:${9*sy}px;
            padding:${2*sy}px 0;`;

        const addItem = (label: string, action: () => void) => {
            const div = document.createElement('div');
            div.style.cssText = `padding:${4*sy}px 16px;cursor:pointer;white-space:nowrap;color:#000;`;
            div.textContent = label;
            div.addEventListener('mouseover', () => { div.style.background='#3170D7'; div.style.color='#FFF'; });
            div.addEventListener('mouseout',  () => { div.style.background=''; div.style.color='#000'; });
            div.addEventListener('mousedown', e => { e.stopPropagation(); action(); this.hideCtxMenu(); });
            menu.appendChild(div);
        };
        const addSep = () => {
            const sep = document.createElement('div');
            sep.style.cssText = `border-top:1px solid #DDD;margin:${2*sy}px 0;`;
            menu.appendChild(sep);
        };

        if (!itemId) {
            // Background click
            addItem('📄 New Text File', () => {
                const item = this.fsAddFile('New File', '', this.myDocsFolderId);
                this.refreshMyDocs();
                this.startInlineRename(item.id, true);
            });
            addItem('📁 New Folder', () => {
                const item = this.fsAddFolder('New Folder', this.myDocsFolderId);
                this.refreshMyDocs();
                this.startInlineRename(item.id, true);
            });
        } else {
            if (itemType === 'folder') {
                addItem('📂 Open', () => {
                    this.myDocsBackStack.push(this.myDocsFolderId);
                    this.myDocsFolderId = itemId;
                    this.refreshMyDocs();
                });
                addSep();
            } else {
                addItem('📝 Open in Notepad', () => this.openFileInNotepad(itemId));
                addSep();
            }
            addItem('✏️ Rename', () => {
                this.startInlineRename(itemId, false);
            });
            addItem('🗑️ Delete', () => {
                const item = this.fsItem(itemId);
                if (!item) return;
                if (confirm(`Delete "${item.name}"?`)) {
                    this.fsDeleteItem(itemId);
                    if (this.myDocsFolderId === itemId) this.myDocsFolderId = null;
                    this.refreshMyDocs();
                }
            });
        }

        document.body.appendChild(menu);
        this.ctxMenuEl = menu;

        const dismiss = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) { this.hideCtxMenu(); document.removeEventListener('mousedown', dismiss); }
        };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    private hideCtxMenu() {
        this.ctxMenuEl?.remove();
        this.ctxMenuEl = null;
    }

    // ─── Notepad File Menu (HTML dropdown, always above other overlays) ───

    private showNotepadFileMenu() {
        this.hideNotepadFileMenu();
        const win = this.wins.get('notepad')!;
        if (!win.open) return;

        const b = this.getWinBounds(win);
        const { sx, sy, rect } = this.canvasScale();

        const menuScreenX = rect.left + (b.x + 6) * sx;
        const menuScreenY = rect.top  + (b.y + this.TB_H + this.MB_H) * sy;

        const menu = document.createElement('div');
        menu.style.cssText = `
            position:fixed; left:${menuScreenX}px; top:${menuScreenY}px;
            min-width:${130 * sx}px; background:#FFFFFF;
            border:1px solid #808080; box-shadow:2px 2px 5px rgba(0,0,0,0.3);
            z-index:20000; font-family:Tahoma,Arial,sans-serif; font-size:${9 * sy}px;
            padding:${2 * sy}px 0;`;

        const items: Array<{ label: string; action?: () => void } | null> = [
            { label: '📄  New',        action: () => this.notepadNew() },
            { label: '📂  Open…',      action: () => this.showOpenDialog() },
            null,
            { label: '💾  Save',       action: () => this.notepadSave() },
            { label: '💾  Save As…',   action: () => this.showSaveDialog() },
            null,
            { label: '❌  Exit',       action: () => this.closeWindow('notepad') },
        ];

        items.forEach(item => {
            if (!item) {
                const sep = document.createElement('div');
                sep.style.cssText = `border-top:1px solid #DDDDDD; margin:${2*sy}px 0;`;
                menu.appendChild(sep);
                return;
            }
            const div = document.createElement('div');
            div.style.cssText = `padding:${4*sy}px ${14*sx}px; cursor:pointer; white-space:nowrap; color:#000;`;
            div.textContent = item.label;
            div.addEventListener('mouseover', () => { div.style.background='#3170D7'; div.style.color='#FFF'; });
            div.addEventListener('mouseout',  () => { div.style.background=''; div.style.color='#000'; });
            div.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                item.action?.();
                this.hideNotepadFileMenu();
            });
            menu.appendChild(div);
        });

        document.body.appendChild(menu);
        this.notepadFileMenuEl = menu;

        // Dismiss on outside click
        const dismiss = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                this.hideNotepadFileMenu();
                document.removeEventListener('mousedown', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    private hideNotepadFileMenu() {
        this.notepadFileMenuEl?.remove();
        this.notepadFileMenuEl = null;
    }

    private notepadNew() {
        if (this.notepadTextEl?.value && !confirm('Discard unsaved changes?')) return;
        this.notepadFilename = 'Untitled';
        if (this.notepadTextEl) this.notepadTextEl.value = '';
        localStorage.setItem(this.NOTEPAD_KEY, '');
        const win = this.wins.get('notepad')!;
        win.title = '📝 Notepad';
        this.renderWindow('notepad');
    }

    private notepadSave() {
        if (this.notepadFilename === 'Untitled') {
            this.notepadSaveAs();
        } else {
            this.persistNotepadFile(this.notepadFilename);
        }
    }

    private notepadSaveAs() {
        this.showSaveDialog();
    }

    private persistNotepadFile(name: string, parentId?: string | null) {
        const content = this.notepadTextEl?.value ?? '';
        const targetParent = parentId !== undefined ? parentId : (this.notepadFileId ? this.fsItem(this.notepadFileId)?.parentId ?? null : null);
        const saved = this.fsAddFile(name, content, targetParent);
        this.notepadFilename = name;
        this.notepadFileId   = saved.id;
        localStorage.setItem(this.NOTEPAD_KEY, content);

        const win = this.wins.get('notepad')!;
        win.title = `📝 ${name} - Notepad`;
        this.renderWindow('notepad');
        this.updateNotepadHtml();

        if (this.wins.get('mydocs')?.open) this.refreshMyDocs();

        this.time.delayedCall(100, () => {
            if (this.notepadTextEl) {
                this.notepadTextEl.style.borderTop = '2px solid #3A9A3A';
                this.time.delayedCall(600, () => {
                    if (this.notepadTextEl) this.notepadTextEl.style.borderTop = '';
                });
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LESSON LOADING
    // ═══════════════════════════════════════════════════════════════════════

    private loadLessons() {
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 10000));

        Promise.race([this.chatService.getLessons(1, 50), timeout])
            .then((result) => {
                if (!this.leoListEl) return;
                const wrap = document.getElementById('leo-tree-wrap');
                if (!wrap) return;

                if (result.success && result.lessons?.length) {
                    this.leoLessons = result.lessons;
                    this.renderLeoSidebar();
                    if (result.lessons[0]) this.loadLesson(result.lessons[0].slug);
                } else {
                    wrap.innerHTML = `<div class="leo-msg">${result.error ?? 'No lessons available.'}</div>`;
                }
            })
            .catch(() => {
                const wrap = document.getElementById('leo-tree-wrap');
                if (wrap) wrap.innerHTML = `<div class="leo-msg">Could not load lessons.<br><small>Check network connection.</small></div>`;
            });
    }

    private loadLesson(slug: string) {
        if (!this.leoContentEl) return;

        this.leoActiveSlug = slug;
        // Update active state in sidebar
        document.querySelectorAll('.leo-lesson').forEach(el => {
            el.classList.toggle('active', (el as HTMLElement).dataset.slug === slug);
        });

        this.leoContentEl.innerHTML = '<div class="xp-placeholder">Loading…</div>';

        this.chatService.getLessonBySlug(slug).then((lesson: LessonResponse) => {
            if (!this.leoContentEl) return;
            if (lesson.success && lesson.content) {
                const rawHtml = marked.parse(lesson.content, { async: false, breaks: true }) as string;
                const html = rawHtml.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
                this.leoContentEl.innerHTML = `<div class="xp-md">${html}</div>`;
                this.leoContentEl.scrollTop = 0;
            } else {
                this.leoContentEl.innerHTML =
                    `<div class="xp-placeholder">${lesson.error ?? 'Could not load lesson.'}</div>`;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    private canvasScale() {
        const rect = this.game.canvas.getBoundingClientRect();
        return {
            sx: rect.width  / this.scale.width,
            sy: rect.height / this.scale.height,
            rect,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CLOSE / CLEANUP
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // WELCOME & SHUTDOWN SCREENS
    // ═══════════════════════════════════════════════════════════════════════

    /** Draws the Windows XP flag (4 panes) into a graphics object at (x, y). */
    private drawXPFlag(g: Phaser.GameObjects.Graphics, x: number, y: number, paneSize: number, paneGap: number, radius: number) {
        g.fillStyle(0xFF3300, 1); g.fillRoundedRect(x,                      y,                      paneSize, paneSize, radius);
        g.fillStyle(0x33AA00, 1); g.fillRoundedRect(x + paneSize + paneGap, y,                      paneSize, paneSize, radius);
        g.fillStyle(0x0055FF, 1); g.fillRoundedRect(x,                      y + paneSize + paneGap, paneSize, paneSize, radius);
        g.fillStyle(0xFFCC00, 1); g.fillRoundedRect(x + paneSize + paneGap, y + paneSize + paneGap, paneSize, paneSize, radius);
    }

    private showWelcomeScreen() {
        const W = this.DW;
        const H = this.scale.height;

        // Hide HTML overlays while the boot animation plays
        this.setHtmlVisible(false);

        const cover = this.add.container(0, 0).setDepth(1000);

        // Black background
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 1);
        bg.fillRect(0, 0, W, H);
        cover.add(bg);

        // ── OG Badge logo + "OverGuild OS" text ──
        const logoSize = 60;
        const logoX    = W / 2 - 100;
        const logoY    = H / 2 - logoSize / 2;
        const textX    = logoX + logoSize + 16;
        const textCY   = H / 2;

        if (this.textures.exists('og-badge')) {
            const badge = this.add.image(logoX + logoSize / 2, H / 2, 'og-badge')
                .setDisplaySize(logoSize, logoSize);
            cover.add(badge);
        } else {
            // Fallback: draw XP flag
            const logoG = this.add.graphics();
            this.drawXPFlag(logoG, logoX, logoY, 28, 4, 5);
            cover.add(logoG);
        }

        const ogT = this.add.text(textX, textCY - 12, 'OverGuild', {
            fontSize: '26px', fontFamily: 'Tahoma,Arial,sans-serif',
            color: '#FFFFFF', fontStyle: 'italic', resolution: 2,
        }).setOrigin(0, 0.5);
        const osT = this.add.text(textX + 2, textCY + 14, 'OS', {
            fontSize: '20px', fontFamily: 'Tahoma,Arial,sans-serif',
            color: '#7EC8F0', fontStyle: 'italic bold', resolution: 2,
        }).setOrigin(0, 0.5);
        cover.add(ogT); cover.add(osT);

        // Thin separator line above loading area
        const sepG = this.add.graphics();
        sepG.lineStyle(1, 0x333333, 1);
        sepG.lineBetween(0, H - 110, W, H - 110);
        cover.add(sepG);

        // ── Animated loading blocks ──
        const NUM = 10, blockW = 18, blockH = 12, blockGap = 4;
        const totalW = NUM * blockW + (NUM - 1) * blockGap;
        const barX   = W / 2 - totalW / 2;
        const barY   = H - 78;
        let activeBlock = 0;
        const loadG = this.add.graphics();
        cover.add(loadG);
        const drawBlocks = () => {
            loadG.clear();
            for (let i = 0; i < NUM; i++) {
                const dist = ((i - activeBlock) % NUM + NUM) % NUM;
                if (dist === 0)      { loadG.fillStyle(0x4A90E2, 1); }
                else if (dist === 1) { loadG.fillStyle(0x4A90E2, 0.6); }
                else if (dist === 2) { loadG.fillStyle(0x4A90E2, 0.25); }
                else                 { loadG.fillStyle(0x1A1A1A, 1); }
                loadG.fillRoundedRect(barX + i * (blockW + blockGap), barY, blockW, blockH, 3);
            }
            activeBlock = (activeBlock + 1) % NUM;
        };
        const blockTimer = this.time.addEvent({ delay: 130, loop: true, callback: drawBlocks });
        drawBlocks();

        // "Please wait..." caption
        const waitT = this.add.text(W / 2, barY + blockH + 8, 'Please wait...', {
            fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif', color: '#777777', resolution: 2,
        }).setOrigin(0.5, 0);
        cover.add(waitT);

        // ── After 2.6 s, fade out and restore HTML overlays ──
        this.time.delayedCall(2600, () => {
            blockTimer.destroy();
            this.tweens.add({
                targets: cover, alpha: 0, duration: 500, ease: 'Power2',
                onComplete: () => {
                    cover.destroy();
                    this.setHtmlVisible(true);
                },
            });
        });
    }

    /** Animate all open windows shrinking & fading out, then resolve. */
    private closeAllWindowsAnimated(): Promise<void> {
        return new Promise(resolve => {
            this.closeStartMenu();
            this.hideNotepadFileMenu();
            this.closeDialog();
            this.hideCtxMenu();
            this.setHtmlVisible(false);

            const openWins = [...this.wins.values()].filter(w => w.open && w.container);
            if (openWins.length === 0) { resolve(); return; }

            let completed = 0;
            openWins.forEach((win, i) => {
                const container = win.container!;
                // Stagger each window by 60 ms
                this.time.delayedCall(i * 60, () => {
                    this.tweens.add({
                        targets: container,
                        scaleX: 0, scaleY: 0, alpha: 0,
                        duration: 180, ease: 'Power2.In',
                        onComplete: () => {
                            container.destroy();
                            win.container = null;
                            win.open = false;
                            completed++;
                            if (completed === openWins.length) resolve();
                        },
                    });
                });
            });
        });
    }

    private showShutdownScreen(): Promise<void> {
        return new Promise(resolve => {
            const W = this.DW;
            const H = this.scale.height;

            const cover = this.add.container(0, 0).setDepth(2000).setAlpha(0);

            // Blue background (XP shutdown colour)
            const bg = this.add.graphics();
            bg.fillStyle(0x003399, 1);
            bg.fillRect(0, 0, W, H);
            cover.add(bg);

            // OG Badge logo
            const logoSize = 50;
            const logoX    = W / 2 - 120;
            const textX    = logoX + logoSize + 16;
            const textCY   = H / 2;

            if (this.textures.exists('og-badge')) {
                const badge = this.add.image(logoX + logoSize / 2, H / 2, 'og-badge')
                    .setDisplaySize(logoSize, logoSize);
                cover.add(badge);
            } else {
                const logoG = this.add.graphics();
                this.drawXPFlag(logoG, logoX, H / 2 - 25, 22, 3, 4);
                cover.add(logoG);
            }

            // Vertical divider
            const divG = this.add.graphics();
            divG.lineStyle(1, 0x6699CC, 1);
            divG.lineBetween(textX - 8, textCY - 26, textX - 8, textCY + 26);
            cover.add(divG);

            const labelT = this.add.text(textX, textCY - 16, 'OverGuild OS', {
                fontSize: '14px', fontFamily: 'Tahoma,Arial,sans-serif',
                color: '#FFFFFF', fontStyle: 'italic bold', resolution: 2,
            }).setOrigin(0, 0.5);
            const msgT = this.add.text(textX, textCY + 10, 'OverGuild OS is shutting down...', {
                fontSize: '12px', fontFamily: 'Tahoma,Arial,sans-serif',
                color: '#CCDDFF', resolution: 2,
            }).setOrigin(0, 0.5);
            cover.add(labelT); cover.add(msgT);

            // Fade in the cover
            this.tweens.add({
                targets: cover, alpha: 1, duration: 450, ease: 'Power2',
                onComplete: () => {
                    // Hold, then fade to black
                    this.time.delayedCall(1400, () => {
                        const blackG = this.add.graphics().setDepth(2001).setAlpha(0);
                        blackG.fillStyle(0x000000, 1);
                        blackG.fillRect(0, 0, W, H);
                        this.tweens.add({
                            targets: blackG, alpha: 1, duration: 700, ease: 'Power2',
                            onComplete: () => resolve(),
                        });
                    });
                },
            });
        });
    }

    private async closeXP() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        await this.closeAllWindowsAnimated();
        await this.showShutdownScreen();
        this.cleanupHtml();
        this.scene.stop();
        this.scene.wake('ClassRoom');
    }

    private cleanupHtml() {
        this.leoListEl?.remove();           this.leoListEl           = null;
        this.leoContentEl?.remove();        this.leoContentEl        = null;
        this.notepadTextEl?.remove();       this.notepadTextEl       = null;
        this.myDocsTreeEl?.remove();        this.myDocsTreeEl        = null;
        this.myDocsListEl?.remove();        this.myDocsListEl        = null;
        this.notepadFileMenuEl?.remove();   this.notepadFileMenuEl   = null;
        this.dialogEl?.remove();            this.dialogEl            = null;
        this.ctxMenuEl?.remove();           this.ctxMenuEl           = null;
    }

    shutdown() {
        this.cleanupHtml();
    }
}
