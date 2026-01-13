// src/game/hooks/usePlantUpdates.ts
import Phaser from 'phaser';
import { EventBus } from '../EventBus';
import { PlantUpdatePayload, SocketPlant } from '../types/SocketTypes';
import { TileState, PlantType, PlantHydration, PlantGrowth, getMaxWaterHours } from '../types/GameTypes';
import { GardenService } from '../GardenService';

/**
 * Callbacks for plant update visual effects
 */
export interface PlantUpdateCallbacks {
    // Get farm land states map
    getFarmLandStates: () => Map<string, TileState>;
    
    // Update plant sprite on tile
    showPlant: (x: number, y: number, plantType: PlantType, stage: number, isDead: boolean, isWilted: boolean) => void;
    
    // Update health bar
    updateHealthBar: (tileKey: string, hoursToDeath: number, maxHours?: number) => void;
    
    // Visual effects
    showWaterSplashEffect?: (x: number, y: number) => void;
    showGrowthEffect?: (x: number, y: number) => void;
    showWitherEffect?: (x: number, y: number) => void;
    
    // Toast messages
    showToastMessage?: (text: string, color: number) => void;
}

/**
 * Plant update handler for real-time WebSocket updates
 * Manages state updates and visual feedback when plants change
 */
export class PlantUpdateHandler {
    private scene: Phaser.Scene;
    private callbacks: PlantUpdateCallbacks;
    private eventListeners: { event: string; callback: (...args: unknown[]) => void }[] = [];

    constructor(scene: Phaser.Scene, callbacks: PlantUpdateCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    /**
     * Start listening for plant update events
     */
    public startListening(): void {
        const plantUpdateHandler = (payload: PlantUpdatePayload) => {
            this.handlePlantUpdate(payload);
        };

        EventBus.on('socket:plant_update', plantUpdateHandler as (...args: unknown[]) => void);
        this.eventListeners.push({ event: 'socket:plant_update', callback: plantUpdateHandler as (...args: unknown[]) => void });

        console.log('[PlantUpdateHandler] Started listening for plant updates');
    }

    /**
     * Stop listening for plant update events
     */
    public stopListening(): void {
        this.eventListeners.forEach(({ event, callback }) => {
            EventBus.off(event, callback);
        });
        this.eventListeners = [];
        console.log('[PlantUpdateHandler] Stopped listening for plant updates');
    }

    /**
     * Handle incoming plant update from WebSocket
     */
    private handlePlantUpdate(payload: PlantUpdatePayload): void {
        const { landId, plant } = payload;
        
        console.log(`[PlantUpdateHandler] Processing update for land ${landId}:`, plant);

        // Find the tile by landId
        const farmLandStates = this.callbacks.getFarmLandStates();
        let targetTileKey: string | null = null;
        let oldState: TileState | null = null;

        for (const [tileKey, state] of farmLandStates.entries()) {
            if (state.landId === landId) {
                targetTileKey = tileKey;
                oldState = { ...state }; // Clone for comparison
                break;
            }
        }

        if (!targetTileKey || !oldState) {
            console.warn(`[PlantUpdateHandler] Land ${landId} not found in farm states`);
            return;
        }

        const state = farmLandStates.get(targetTileKey);
        if (!state) return;

        // Parse tile coordinates
        const [x, y] = targetTileKey.split(',').map(Number);

        // Detect changes for visual feedback
        const oldWaterBalance = oldState.hydration?.waterBalance ?? 0;
        const newWaterBalance = plant.waterBalance;
        const oldStage = oldState.plantInfo?.stage;
        const newStage = plant.stage;
        const wasWithered = !!(oldState.plantInfo?.waterBalance && oldState.hydration?.isWithering);
        const isNowWithered = !!plant.witheredAt;

        // Update state immutably
        this.updateTileState(state, plant);

        // Trigger visual effects based on changes
        this.triggerVisualFeedback(x, y, targetTileKey, {
            oldWaterBalance,
            newWaterBalance,
            oldStage,
            newStage,
            wasWithered,
            isNowWithered,
            plant,
        });

        console.log(`[PlantUpdateHandler] Updated tile ${targetTileKey} successfully`);
    }

    /**
     * Update tile state with new plant data
     */
    private updateTileState(state: TileState, plant: SocketPlant): void {
        const plantType = GardenService.mapPlantTypeToGameType(plant.type);
        const plantStage = GardenService.mapStageToGameStage(plant.stage);
        const isDead = plant.stage === 'DEAD';
        const isWithered = !!plant.witheredAt;

        // Update basic state
        state.planted = true;
        state.cropType = plantType;
        state.plantStage = plantStage;
        state.isDead = isDead;
        state.isWilted = isWithered;
        state.plantId = plant.id;
        state.landId = plant.landId;
        state.lastRefreshTime = Date.now();

        // Update plant info
        state.plantInfo = {
            id: plant.id,
            type: plant.type,
            name: plant.type.toLowerCase(),
            stage: plant.stage,
            plantedAt: state.plantInfo?.plantedAt || new Date().toISOString(),
            waterBalance: plant.waterBalance,
        };

        // Update hydration data
        const hoursToDeath = Math.max(0, plant.waterBalance);
        state.hydration = {
            hoursToDeath,
            isDead,
            isWithering: isWithered,
            status: isDead ? 'DEAD' : isWithered ? 'WITHERING' : 'HEALTHY',
            message: isDead ? 'Plant is dead' : isWithered ? 'Plant needs water!' : 'Healthy',
            waterBalance: plant.waterBalance,
        } as PlantHydration;

        // Update growth data
        state.growth = {
            activeGrowthHours: plant.activeGrowthHours,
            currentStage: plant.stage,
            hoursRemaining: 0, // Will be calculated by backend
            progress: 0,
            totalHoursNeeded: 0,
        } as PlantGrowth;
    }

    /**
     * Trigger visual feedback based on state changes
     */
    private triggerVisualFeedback(
        x: number,
        y: number,
        tileKey: string,
        changes: {
            oldWaterBalance: number;
            newWaterBalance: number;
            oldStage?: string;
            newStage: string;
            wasWithered: boolean;
            isNowWithered: boolean;
            plant: SocketPlant;
        }
    ): void {
        const { oldWaterBalance, newWaterBalance, oldStage, newStage, wasWithered, isNowWithered, plant } = changes;
        const plantType = GardenService.mapPlantTypeToGameType(plant.type);
        const plantStage = GardenService.mapStageToGameStage(plant.stage);
        const isDead = plant.stage === 'DEAD';

        // 1. Hydration Update - Water splash effect
        if (newWaterBalance > oldWaterBalance) {
            console.log(`[PlantUpdateHandler] Water increased: ${oldWaterBalance} -> ${newWaterBalance}`);
            this.callbacks.showWaterSplashEffect?.(x, y);
            this.callbacks.showToastMessage?.('💧 Plant watered!', 0x2196F3);
        }

        // 2. Growth Stage Change - Level up effect
        if (oldStage && oldStage !== newStage) {
            console.log(`[PlantUpdateHandler] Stage changed: ${oldStage} -> ${newStage}`);
            this.callbacks.showGrowthEffect?.(x, y);
            
            if (plant.isHarvestable) {
                this.callbacks.showToastMessage?.('🌾 Ready to harvest!', 0x4CAF50);
            } else if (newStage !== 'DEAD') {
                this.callbacks.showToastMessage?.(`🌱 Plant grew to ${newStage}!`, 0x4CAF50);
            }
        }

        // 3. Withering state change
        if (!wasWithered && isNowWithered) {
            console.log(`[PlantUpdateHandler] Plant started withering`);
            this.callbacks.showWitherEffect?.(x, y);
            this.callbacks.showToastMessage?.('⚠️ Plant is withering!', 0xFFC107);
        } else if (wasWithered && !isNowWithered) {
            console.log(`[PlantUpdateHandler] Plant recovered from withering`);
            this.callbacks.showToastMessage?.('💚 Plant recovered!', 0x4CAF50);
        }

        // 4. Death
        if (newStage === 'DEAD' && oldStage !== 'DEAD') {
            console.log(`[PlantUpdateHandler] Plant died`);
            this.callbacks.showToastMessage?.('💀 Plant died!', 0xE74C3C);
        }

        // Update plant sprite
        this.callbacks.showPlant(x, y, plantType, plantStage, isDead, isNowWithered);

        // Update health bar with plant-type-specific max water hours
        if (!isDead) {
            const maxHours = getMaxWaterHours(plant.type);
            this.callbacks.updateHealthBar(tileKey, plant.waterBalance, maxHours);
        }
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        this.stopListening();
    }
}
