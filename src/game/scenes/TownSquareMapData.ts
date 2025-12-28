// Town Square map design - Larger rectangular area
// 0 = water (animated water sprites around edges)
// 1 = stone floor (square tileset)
// 2 = stone variation (decorative)

// Helper function to generate map rows
const generateRow = (waterLeft: number, stoneCount: number, waterRight: number, variation: boolean = false): number[] => {
    const row: number[] = [];
    for (let i = 0; i < waterLeft; i++) row.push(0);
    for (let i = 0; i < stoneCount; i++) {
        // Add occasional variations
        if (variation && Math.random() < 0.1) {
            row.push(2);
        } else {
            row.push(1);
        }
    }
    for (let i = 0; i < waterRight; i++) row.push(0);
    return row;
};

// Generate 60x60 map
const MAP_SIZE = 60;
const WATER_BORDER = 8; // Water border on each side
const STONE_AREA = MAP_SIZE - (WATER_BORDER * 2); // 44 tiles of stone

const generateMap = (): number[][] => {
    const map: number[][] = [];

    for (let row = 0; row < MAP_SIZE; row++) {
        if (row < WATER_BORDER || row >= MAP_SIZE - WATER_BORDER) {
            // Full water row (top and bottom borders)
            map.push(Array(MAP_SIZE).fill(0));
        } else {
            // Stone area with water borders
            const addVariation = row % 5 === 0; // Variation every 5 rows
            map.push(generateRow(WATER_BORDER, STONE_AREA, WATER_BORDER, addVariation));
        }
    }

    return map;
};

export const TOWN_SQUARE_MAP_DATA = generateMap();

// Map dimensions for reference
export const TOWN_SQUARE_MAP_WIDTH = MAP_SIZE;
export const TOWN_SQUARE_MAP_HEIGHT = MAP_SIZE;
