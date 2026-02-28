// ClassRoom map design
// 0 = black background (no tile rendered)
// 1 = classroom floor tile
// 2 = floor variation tile
// 3 = wall TOP row  (cream cap — tiles 55-59, brown border on top)
// 4 = wall BODY row (plain cream fill — tiles 61/62)

const MAP_WIDTH  = 40;
const MAP_HEIGHT = 30;
const BORDER = 3; // Black border on each side

// Interior bounds
const FLOOR_LEFT   = BORDER;
const FLOOR_RIGHT  = MAP_WIDTH  - BORDER; // exclusive
const FLOOR_TOP    = BORDER;
const FLOOR_BOTTOM = MAP_HEIGHT - BORDER; // exclusive

// Wall occupies the first rows inside the border:
//   FLOOR_TOP+0  = wall TOP  (value 3)
//   FLOOR_TOP+1  = wall BODY (value 4)  ← 4 body rows total
//   FLOOR_TOP+2  = wall BODY (value 4)
//   FLOOR_TOP+3  = wall BODY (value 4)
//   FLOOR_TOP+4  = wall BODY (value 4)

const WALL_BODY_ROWS = 4;

// No tile-level padding — visual padding drawn via Rectangle overlays in ClassRoom.ts
const WALL_PADDING = 0;

export const CLASS_ROOM_WALL_TOP_ROW    = FLOOR_TOP;
export const CLASS_ROOM_WALL_BODY_ROWS  = WALL_BODY_ROWS;
export const CLASS_ROOM_FIRST_FLOOR_ROW = FLOOR_TOP + 1 + WALL_BODY_ROWS;

// Actual tile columns where wall tiles are rendered (inset by WALL_PADDING)
export const CLASS_ROOM_WALL_LEFT  = FLOOR_LEFT  + WALL_PADDING;  // first wall tile col
export const CLASS_ROOM_WALL_RIGHT = FLOOR_RIGHT - WALL_PADDING;  // last wall tile col (exclusive)

export const CLASS_ROOM_FLOOR_BORDER = BORDER;
export const CLASS_ROOM_MAP_WIDTH    = MAP_WIDTH;
export const CLASS_ROOM_MAP_HEIGHT   = MAP_HEIGHT;

// ─── Map generation ───────────────────────────────────────────────────────────

const generateClassRoomMap = (): number[][] => {
    const map: number[][] = [];

    for (let row = 0; row < MAP_HEIGHT; row++) {
        const mapRow: number[] = [];

        for (let col = 0; col < MAP_WIDTH; col++) {
            // Outside the interior bounds → black
            if (
                row < FLOOR_TOP    || row >= FLOOR_BOTTOM ||
                col < FLOOR_LEFT   || col >= FLOOR_RIGHT
            ) {
                mapRow.push(0);

            // Wall rows
            } else if (row === CLASS_ROOM_WALL_TOP_ROW) {
                // Outer columns of wall rows → black (padding)
                if (col < CLASS_ROOM_WALL_LEFT || col >= CLASS_ROOM_WALL_RIGHT) {
                    mapRow.push(0);
                } else {
                    mapRow.push(3); // Wall cap
                }

            } else if (row < CLASS_ROOM_FIRST_FLOOR_ROW) {
                // Outer columns of wall rows → black (padding)
                if (col < CLASS_ROOM_WALL_LEFT || col >= CLASS_ROOM_WALL_RIGHT) {
                    mapRow.push(0);
                } else {
                    mapRow.push(4); // Wall body
                }

            // Floor rows
            } else {
                // Occasional variation every 4 tiles (offset by first floor row)
                const floorRow = row - CLASS_ROOM_FIRST_FLOOR_ROW;
                if (floorRow % 4 === 0 && (col - FLOOR_LEFT) % 4 === 0) {
                    mapRow.push(2);
                } else {
                    mapRow.push(1);
                }
            }
        }

        map.push(mapRow);
    }

    return map;
};

export const CLASS_ROOM_MAP_DATA = generateClassRoomMap();
