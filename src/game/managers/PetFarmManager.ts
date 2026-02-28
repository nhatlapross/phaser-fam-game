import Phaser from "phaser";

/**
 * PetFarmManager - Quản lý logic nuôi thú cưng
 *
 * Responsibilities:
 * - Quản lý pet data (hunger, happiness, energy)
 * - Xử lý feeding (cho ăn)
 * - Xử lý playing (chơi với pet)
 * - Pet evolution (tiến hóa)
 * - Save/Load pet state
 */

export interface PetStats {
    id: string;
    type: "cat" | "dino" | "dragon" | "lion";
    name: string;
    stage: "egg" | "baby" | "teen" | "adult" | "legendary";
    level: number;
    xp: number;
    hunger: number; // 0-100 (100 = full, 0 = starving)
    happiness: number; // 0-100
    energy: number; // 0-100
    lastFed: number; // timestamp
    lastPlayed: number; // timestamp
    slotIndex: number; // 0-3
    createdAt: number; // timestamp
}

export interface PetFarmCallbacks {
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound: () => void;
    refreshUI: () => void;
}

export class PetFarmManager {
    private scene: Phaser.Scene;
    private callbacks: PetFarmCallbacks;

    // Pet data storage
    private pets: Map<number, PetStats> = new Map();

    // Constants
    private readonly HUNGER_DECAY_RATE = 1; // -1 hunger per minute
    private readonly ENERGY_DECAY_RATE = 0.5; // -0.5 energy per minute
    private readonly HAPPINESS_DECAY_RATE = 0.3; // -0.3 happiness per minute

    private readonly XP_TO_LEVEL_UP = 100;
    private readonly LEVEL_TO_EVOLVE: Record<PetStats["stage"], number> = {
        egg: 1, // Egg → Baby at level 1
        baby: 5, // Baby → Teen at level 5
        teen: 10, // Teen → Adult at level 10
        adult: 20, // Adult → Legendary at level 20
        legendary: Infinity, // Max stage, no further evolution
    };

    constructor(scene: Phaser.Scene, callbacks: PetFarmCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    /**
     * Load pet data from localStorage (temporary - will use API later)
     */
    public loadPets(): Map<number, PetStats> {
        const saved = localStorage.getItem("overguild_pets");
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.pets = new Map(
                    Object.entries(data).map(([k, v]) => [
                        parseInt(k),
                        v as PetStats,
                    ]),
                );
            } catch (e) {
                console.error("Failed to load pets:", e);
            }
        }
        return this.pets;
    }

    /**
     * Save pet data to localStorage
     */
    public savePets(): void {
        const data = Object.fromEntries(this.pets);
        localStorage.setItem("overguild_pets", JSON.stringify(data));
    }

    /**
     * Get pet by slot index
     */
    public getPet(slotIndex: number): PetStats | undefined {
        return this.pets.get(slotIndex);
    }

    /**
     * Get all pets
     */
    public getAllPets(): Map<number, PetStats> {
        return this.pets;
    }

    /**
     * Adopt a new pet (place egg in slot)
     */
    public adoptPet(
        slotIndex: number,
        petType: "cat" | "dino" | "dragon" | "lion",
        name: string,
    ): PetStats {
        const newPet: PetStats = {
            id: `pet_${Date.now()}_${slotIndex}`,
            type: petType,
            name: name,
            stage: "egg",
            level: 0,
            xp: 0,
            hunger: 50,
            happiness: 50,
            energy: 100,
            lastFed: Date.now(),
            lastPlayed: Date.now(),
            slotIndex: slotIndex,
            createdAt: Date.now(),
        };

        this.pets.set(slotIndex, newPet);
        this.savePets();

        this.callbacks.showToastMessage(`🥚 Adopted ${name}!`, 0x2ecc71);
        this.callbacks.playSuccessSound();

        return newPet;
    }

    /**
     * Feed pet with mushroom or fruit
     */
    public feedPet(slotIndex: number, foodType: "mushroom" | "fruit"): boolean {
        const pet = this.pets.get(slotIndex);
        if (!pet) return false;

        // Check if pet is hungry
        if (pet.hunger >= 90) {
            this.callbacks.showToastMessage(
                `${pet.name} is not hungry!`,
                0xf39c12,
            );
            return false;
        }

        // Feed pet
        const hungerRestore = foodType === "mushroom" ? 20 : 40;
        pet.hunger = Math.min(100, pet.hunger + hungerRestore);
        pet.happiness = Math.min(100, pet.happiness + 10);
        pet.xp += 5;
        pet.lastFed = Date.now();

        this.checkLevelUp(pet);
        this.savePets();

        this.callbacks.showToastMessage(
            `Fed ${pet.name} with ${foodType}! 🍄`,
            0x2ecc71,
        );
        this.callbacks.playSuccessSound();
        this.callbacks.refreshUI();

        return true;
    }

    /**
     * Play with pet (mini-game)
     */
    public playWithPet(slotIndex: number): boolean {
        const pet = this.pets.get(slotIndex);
        if (!pet) return false;

        // Check if pet has energy
        if (pet.energy < 20) {
            this.callbacks.showToastMessage(
                `${pet.name} is too tired!`,
                0xe74c3c,
            );
            return false;
        }

        // Play with pet
        pet.energy = Math.max(0, pet.energy - 20);
        pet.happiness = Math.min(100, pet.happiness + 30);
        pet.xp += 10;
        pet.lastPlayed = Date.now();

        this.checkLevelUp(pet);
        this.savePets();

        this.callbacks.showToastMessage(
            `Played with ${pet.name}! 🎮`,
            0x2ecc71,
        );
        this.callbacks.playSuccessSound();
        this.callbacks.refreshUI();

        return true;
    }

    /**
     * Check if pet should level up
     */
    private checkLevelUp(pet: PetStats): void {
        while (pet.xp >= this.XP_TO_LEVEL_UP) {
            pet.xp -= this.XP_TO_LEVEL_UP;
            pet.level++;

            this.callbacks.showToastMessage(
                `${pet.name} leveled up to ${pet.level}! ⭐`,
                0xf39c12,
            );

            // Check evolution
            this.checkEvolution(pet);
        }
    }

    /**
     * Check if pet should evolve
     */
    private checkEvolution(pet: PetStats): void {
        const requiredLevel = this.LEVEL_TO_EVOLVE[pet.stage];

        if (pet.level >= requiredLevel) {
            const stages: Array<PetStats["stage"]> = [
                "egg",
                "baby",
                "teen",
                "adult",
                "legendary",
            ];
            const currentIndex = stages.indexOf(pet.stage);

            if (currentIndex < stages.length - 1) {
                pet.stage = stages[currentIndex + 1];
                this.callbacks.showToastMessage(
                    `${pet.name} evolved to ${pet.stage}! 🌟`,
                    0x9b59b6,
                );
            }
        }
    }

    /**
     * Update all pets (decay stats over time)
     */
    public updatePets(): void {
        const now = Date.now();

        this.pets.forEach((pet) => {
            const minutesSinceLastFed = (now - pet.lastFed) / 60000;
            const minutesSinceLastPlayed = (now - pet.lastPlayed) / 60000;

            // Decay hunger
            pet.hunger = Math.max(
                0,
                pet.hunger - this.HUNGER_DECAY_RATE * minutesSinceLastFed,
            );

            // Decay energy (recovers slowly)
            pet.energy = Math.min(100, pet.energy + 0.1);

            // Decay happiness
            pet.happiness = Math.max(
                0,
                pet.happiness -
                    this.HAPPINESS_DECAY_RATE * minutesSinceLastPlayed,
            );
        });

        this.savePets();
    }

    /**
     * Get pet sprite key based on stage
     */
    public getPetSpriteKey(pet: PetStats): string {
        return `pet-${pet.type}`;
    }

    /**
     * Get pet scale based on stage
     */
    public getPetScale(pet: PetStats): number {
        const scales = {
            egg: 0.15,
            baby: 0.2,
            teen: 0.25,
            adult: 0.3,
            legendary: 0.35,
        };
        return scales[pet.stage];
    }
}

