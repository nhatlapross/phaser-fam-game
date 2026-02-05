import { UserService } from './UserService';

// Types
export type CardOrientation = 'upright' | 'reversed';
export type SpreadType = 'single' | 'three-card' | 'five-card' | 'celtic-cross';
export type Topic = 'love' | 'career' | 'finance' | 'health' | 'family' | 'general';

export interface LocalizedString {
    vi: string;
    en: string;
}

export interface TarotCard {
    id: string;
    name: LocalizedString;
    image: string;
    arcana: 'major' | 'minor';
    number: number;
    meanings: {
        upright: LocalizedString;
        reversed: LocalizedString;
    };
}

export interface SpreadPosition {
    index: number;
    name: LocalizedString;
    description: LocalizedString;
}

export interface SpreadConfig {
    type: SpreadType;
    name: LocalizedString;
    description: LocalizedString;
    cardCount: number;
    positions: SpreadPosition[];
}

export interface DrawnCard {
    card: TarotCard;
    orientation: CardOrientation;
    position: SpreadPosition;
}

export interface AIInterpretation {
    cardInterpretations: {
        cardId: string;
        interpretation: string;
    }[];
    overallReading: string;
    advice: string;
}

export interface TarotReadingRequest {
    question: string;
    topic?: Topic;
    spread: SpreadType;
    drawnCards: {
        cardId: string;
        cardName: string;
        orientation: CardOrientation;
        positionName: string;
        meaning: string;
    }[];
}

export interface TarotReadingResponse {
    success: boolean;
    interpretation?: AIInterpretation;
    remainingGold?: number;
    error?: string;
}

// Spread configurations with cost
export const SPREAD_COSTS: Record<SpreadType, number> = {
    'single': 20,
    'three-card': 40,
    'five-card': 60,
    'celtic-cross': 100
};

export const SPREADS: SpreadConfig[] = [
    {
        type: 'single',
        name: { vi: 'Một Lá', en: 'Single Card' },
        description: { vi: 'Câu trả lời nhanh', en: 'Quick answer' },
        cardCount: 1,
        positions: [
            { index: 0, name: { vi: 'Câu trả lời', en: 'Answer' }, description: { vi: 'Thông điệp chính', en: 'Main message' } }
        ]
    },
    {
        type: 'three-card',
        name: { vi: 'Ba Lá', en: 'Three Cards' },
        description: { vi: 'Quá khứ - Hiện tại - Tương lai', en: 'Past - Present - Future' },
        cardCount: 3,
        positions: [
            { index: 0, name: { vi: 'Quá khứ', en: 'Past' }, description: { vi: 'Những gì đã xảy ra', en: 'What has happened' } },
            { index: 1, name: { vi: 'Hiện tại', en: 'Present' }, description: { vi: 'Tình huống hiện tại', en: 'Current situation' } },
            { index: 2, name: { vi: 'Tương lai', en: 'Future' }, description: { vi: 'Xu hướng sắp tới', en: 'Upcoming trend' } }
        ]
    },
    {
        type: 'five-card',
        name: { vi: 'Năm Lá', en: 'Five Cards' },
        description: { vi: 'Phân tích sâu', en: 'Deep analysis' },
        cardCount: 5,
        positions: [
            { index: 0, name: { vi: 'Hiện tại', en: 'Present' }, description: { vi: 'Tình huống hiện tại', en: 'Current situation' } },
            { index: 1, name: { vi: 'Thử thách', en: 'Challenge' }, description: { vi: 'Trở ngại đang đối mặt', en: 'Obstacle you face' } },
            { index: 2, name: { vi: 'Quá khứ', en: 'Past' }, description: { vi: 'Ảnh hưởng từ quá khứ', en: 'Past influences' } },
            { index: 3, name: { vi: 'Tương lai', en: 'Future' }, description: { vi: 'Xu hướng sắp tới', en: 'Upcoming trend' } },
            { index: 4, name: { vi: 'Kết quả', en: 'Outcome' }, description: { vi: 'Kết quả có thể', en: 'Possible outcome' } }
        ]
    },
    {
        type: 'celtic-cross',
        name: { vi: 'Celtic Cross', en: 'Celtic Cross' },
        description: { vi: 'Phân tích toàn diện', en: 'Comprehensive analysis' },
        cardCount: 10,
        positions: [
            { index: 0, name: { vi: 'Hiện tại', en: 'Present' }, description: { vi: 'Tình huống hiện tại', en: 'Current situation' } },
            { index: 1, name: { vi: 'Thử thách', en: 'Challenge' }, description: { vi: 'Trở ngại chính', en: 'Main obstacle' } },
            { index: 2, name: { vi: 'Nền tảng', en: 'Foundation' }, description: { vi: 'Cơ sở của tình huống', en: 'Basis of situation' } },
            { index: 3, name: { vi: 'Quá khứ gần', en: 'Recent Past' }, description: { vi: 'Sự kiện gần đây', en: 'Recent events' } },
            { index: 4, name: { vi: 'Kết quả tốt nhất', en: 'Best Outcome' }, description: { vi: 'Kết quả tốt nhất có thể', en: 'Best possible outcome' } },
            { index: 5, name: { vi: 'Tương lai gần', en: 'Near Future' }, description: { vi: 'Những gì sắp xảy ra', en: 'What is about to happen' } },
            { index: 6, name: { vi: 'Bản thân', en: 'Self' }, description: { vi: 'Thái độ và cảm xúc', en: 'Your attitude and feelings' } },
            { index: 7, name: { vi: 'Môi trường', en: 'Environment' }, description: { vi: 'Ảnh hưởng từ người khác', en: 'Influence from others' } },
            { index: 8, name: { vi: 'Hy vọng & Nỗi sợ', en: 'Hopes & Fears' }, description: { vi: 'Hy vọng và nỗi sợ', en: 'Your hopes and fears' } },
            { index: 9, name: { vi: 'Kết quả', en: 'Outcome' }, description: { vi: 'Kết quả cuối cùng', en: 'Final outcome' } }
        ]
    }
];

export const TOPICS: { value: Topic; label: LocalizedString; icon: string }[] = [
    { value: 'love', label: { vi: 'Tình yêu', en: 'Love' }, icon: '❤️' },
    { value: 'career', label: { vi: 'Sự nghiệp', en: 'Career' }, icon: '💼' },
    { value: 'finance', label: { vi: 'Tài chính', en: 'Finance' }, icon: '💰' },
    { value: 'health', label: { vi: 'Sức khỏe', en: 'Health' }, icon: '🏥' },
    { value: 'family', label: { vi: 'Gia đình', en: 'Family' }, icon: '👨‍👩‍👧‍👦' },
    { value: 'general', label: { vi: 'Tổng quát', en: 'General' }, icon: '🌟' }
];


// Helper to get card image path
export function getCardImagePath(cardId: string): string {
    const BASE_PATH = '/assets/tarot';
    
    // Major Arcana mapping
    const majorMap: Record<string, string> = {
        'major-0': 'major-00-fool',
        'major-1': 'major-01-magician',
        'major-2': 'major-02-high-priestess',
        'major-3': 'major-03-empress',
        'major-4': 'major-04-emperor',
        'major-5': 'major-05-hierophant',
        'major-6': 'major-06-lovers',
        'major-7': 'major-07-chariot',
        'major-8': 'major-08-strength',
        'major-9': 'major-09-hermit',
        'major-10': 'major-10-wheel',
        'major-11': 'major-11-justice',
        'major-12': 'major-12-hanged-man',
        'major-13': 'major-13-death',
        'major-14': 'major-14-temperance',
        'major-15': 'major-15-devil',
        'major-16': 'major-16-tower',
        'major-17': 'major-17-star',
        'major-18': 'major-18-moon',
        'major-19': 'major-19-sun',
        'major-20': 'major-20-judgement',
        'major-21': 'major-21-world'
    };
    
    if (majorMap[cardId]) {
        return `${BASE_PATH}/${majorMap[cardId]}.png`;
    }
    
    // Minor Arcana: wands-ace -> wands-01, wands-2 -> wands-02, etc.
    const minorMatch = cardId.match(/^(wands|cups|swords|pentacles)-(.+)$/);
    if (minorMatch) {
        const [, suit, value] = minorMatch;
        let num: string;
        if (value === 'ace') num = '01';
        else if (value === 'page') num = '11';
        else if (value === 'knight') num = '12';
        else if (value === 'queen') num = '13';
        else if (value === 'king') num = '14';
        else num = value.padStart(2, '0');
        return `${BASE_PATH}/${suit}-${num}.png`;
    }
    
    return '';
}

// Major Arcana cards
export const TAROT_CARDS: TarotCard[] = [
    { id: 'major-0', name: { vi: 'Kẻ Khờ', en: 'The Fool' }, image: '/assets/tarot/major-00-fool.png', arcana: 'major', number: 0,
      meanings: { upright: { vi: 'Khởi đầu mới, tự do, phiêu lưu', en: 'New beginnings, freedom, adventure' }, reversed: { vi: 'Liều lĩnh, thiếu suy nghĩ', en: 'Recklessness, thoughtlessness' } } },
    { id: 'major-1', name: { vi: 'Pháp Sư', en: 'The Magician' }, image: '/assets/tarot/major-01-magician.png', arcana: 'major', number: 1,
      meanings: { upright: { vi: 'Sức mạnh ý chí, kỹ năng', en: 'Willpower, skill' }, reversed: { vi: 'Lừa dối, thao túng', en: 'Deception, manipulation' } } },
    { id: 'major-2', name: { vi: 'Nữ Tư Tế', en: 'The High Priestess' }, image: '/assets/tarot/major-02-high-priestess.png', arcana: 'major', number: 2,
      meanings: { upright: { vi: 'Trực giác, bí ẩn', en: 'Intuition, mystery' }, reversed: { vi: 'Bí mật, rút lui', en: 'Secrets, withdrawal' } } },
    { id: 'major-3', name: { vi: 'Hoàng Hậu', en: 'The Empress' }, image: '/assets/tarot/major-03-empress.png', arcana: 'major', number: 3,
      meanings: { upright: { vi: 'Sinh sản, sung túc', en: 'Fertility, abundance' }, reversed: { vi: 'Phụ thuộc, trống rỗng', en: 'Dependence, emptiness' } } },
    { id: 'major-4', name: { vi: 'Hoàng Đế', en: 'The Emperor' }, image: '/assets/tarot/major-04-emperor.png', arcana: 'major', number: 4,
      meanings: { upright: { vi: 'Quyền lực, cấu trúc', en: 'Authority, structure' }, reversed: { vi: 'Độc đoán, cứng nhắc', en: 'Tyranny, rigidity' } } },
    { id: 'major-5', name: { vi: 'Giáo Hoàng', en: 'The Hierophant' }, image: '/assets/tarot/major-05-hierophant.png', arcana: 'major', number: 5,
      meanings: { upright: { vi: 'Truyền thống, đạo đức', en: 'Tradition, morality' }, reversed: { vi: 'Nổi loạn, tự do', en: 'Rebellion, freedom' } } },
    { id: 'major-6', name: { vi: 'Người Yêu', en: 'The Lovers' }, image: '/assets/tarot/major-06-lovers.png', arcana: 'major', number: 6,
      meanings: { upright: { vi: 'Tình yêu, hài hòa', en: 'Love, harmony' }, reversed: { vi: 'Mất cân bằng', en: 'Imbalance' } } },
    { id: 'major-7', name: { vi: 'Cỗ Xe', en: 'The Chariot' }, image: '/assets/tarot/major-07-chariot.png', arcana: 'major', number: 7,
      meanings: { upright: { vi: 'Chiến thắng, quyết tâm', en: 'Victory, determination' }, reversed: { vi: 'Thiếu kiểm soát', en: 'Lack of control' } } },
    { id: 'major-8', name: { vi: 'Sức Mạnh', en: 'Strength' }, image: '/assets/tarot/major-08-strength.png', arcana: 'major', number: 8,
      meanings: { upright: { vi: 'Sức mạnh nội tâm, dũng cảm', en: 'Inner strength, courage' }, reversed: { vi: 'Yếu đuối, tự nghi ngờ', en: 'Weakness, self-doubt' } } },
    { id: 'major-9', name: { vi: 'Ẩn Sĩ', en: 'The Hermit' }, image: '/assets/tarot/major-09-hermit.png', arcana: 'major', number: 9,
      meanings: { upright: { vi: 'Nội tâm, tìm kiếm', en: 'Introspection, searching' }, reversed: { vi: 'Cô lập, cô đơn', en: 'Isolation, loneliness' } } },
    { id: 'major-10', name: { vi: 'Vòng Quay Số Phận', en: 'Wheel of Fortune' }, image: '/assets/tarot/major-10-wheel.png', arcana: 'major', number: 10,
      meanings: { upright: { vi: 'May mắn, thay đổi', en: 'Luck, change' }, reversed: { vi: 'Xui xẻo', en: 'Bad luck' } } },
    { id: 'major-11', name: { vi: 'Công Lý', en: 'Justice' }, image: '/assets/tarot/major-11-justice.png', arcana: 'major', number: 11,
      meanings: { upright: { vi: 'Công bằng, sự thật', en: 'Fairness, truth' }, reversed: { vi: 'Bất công', en: 'Unfairness' } } },
    { id: 'major-12', name: { vi: 'Người Treo Ngược', en: 'The Hanged Man' }, image: '/assets/tarot/major-12-hanged-man.png', arcana: 'major', number: 12,
      meanings: { upright: { vi: 'Tạm dừng, hy sinh', en: 'Pause, sacrifice' }, reversed: { vi: 'Trì hoãn, bế tắc', en: 'Delays, stalling' } } },
    { id: 'major-13', name: { vi: 'Thần Chết', en: 'Death' }, image: '/assets/tarot/major-13-death.png', arcana: 'major', number: 13,
      meanings: { upright: { vi: 'Kết thúc, chuyển đổi', en: 'Endings, transformation' }, reversed: { vi: 'Kháng cự thay đổi', en: 'Resistance to change' } } },
    { id: 'major-14', name: { vi: 'Tiết Độ', en: 'Temperance' }, image: '/assets/tarot/major-14-temperance.png', arcana: 'major', number: 14,
      meanings: { upright: { vi: 'Cân bằng, điều độ', en: 'Balance, moderation' }, reversed: { vi: 'Mất cân bằng', en: 'Imbalance' } } },
    { id: 'major-15', name: { vi: 'Ác Quỷ', en: 'The Devil' }, image: '/assets/tarot/major-15-devil.png', arcana: 'major', number: 15,
      meanings: { upright: { vi: 'Ràng buộc, nghiện ngập', en: 'Bondage, addiction' }, reversed: { vi: 'Giải thoát', en: 'Liberation' } } },
    { id: 'major-16', name: { vi: 'Tháp', en: 'The Tower' }, image: '/assets/tarot/major-16-tower.png', arcana: 'major', number: 16,
      meanings: { upright: { vi: 'Sụp đổ, thay đổi đột ngột', en: 'Upheaval, sudden change' }, reversed: { vi: 'Tránh được thảm họa', en: 'Avoiding disaster' } } },
    { id: 'major-17', name: { vi: 'Ngôi Sao', en: 'The Star' }, image: '/assets/tarot/major-17-star.png', arcana: 'major', number: 17,
      meanings: { upright: { vi: 'Hy vọng, niềm tin', en: 'Hope, faith' }, reversed: { vi: 'Tuyệt vọng', en: 'Despair' } } },
    { id: 'major-18', name: { vi: 'Mặt Trăng', en: 'The Moon' }, image: '/assets/tarot/major-18-moon.png', arcana: 'major', number: 18,
      meanings: { upright: { vi: 'Ảo tưởng, sợ hãi', en: 'Illusion, fear' }, reversed: { vi: 'Sự thật được tiết lộ', en: 'Truth revealed' } } },
    { id: 'major-19', name: { vi: 'Mặt Trời', en: 'The Sun' }, image: '/assets/tarot/major-19-sun.png', arcana: 'major', number: 19,
      meanings: { upright: { vi: 'Niềm vui, thành công', en: 'Joy, success' }, reversed: { vi: 'Tiêu cực tạm thời', en: 'Temporary negativity' } } },
    { id: 'major-20', name: { vi: 'Phán Xét', en: 'Judgement' }, image: '/assets/tarot/major-20-judgement.png', arcana: 'major', number: 20,
      meanings: { upright: { vi: 'Tái sinh, thức tỉnh', en: 'Rebirth, awakening' }, reversed: { vi: 'Tự phê phán', en: 'Self-criticism' } } },
    { id: 'major-21', name: { vi: 'Thế Giới', en: 'The World' }, image: '/assets/tarot/major-21-world.png', arcana: 'major', number: 21,
      meanings: { upright: { vi: 'Hoàn thành, thành tựu', en: 'Completion, accomplishment' }, reversed: { vi: 'Chưa hoàn thành', en: 'Incompletion' } } },
    
    // Minor Arcana - Wands (14 cards)
    { id: 'wands-ace', name: { vi: 'Át Gậy', en: 'Ace of Wands' }, image: '/assets/tarot/wands-01.png', arcana: 'minor', number: 1,
      meanings: { upright: { vi: 'Cảm hứng, sáng tạo', en: 'Inspiration, creativity' }, reversed: { vi: 'Trì hoãn, thiếu động lực', en: 'Delays, lack of motivation' } } },
    { id: 'wands-2', name: { vi: 'Hai Gậy', en: 'Two of Wands' }, image: '/assets/tarot/wands-02.png', arcana: 'minor', number: 2,
      meanings: { upright: { vi: 'Lập kế hoạch, quyết định', en: 'Planning, decisions' }, reversed: { vi: 'Sợ thay đổi', en: 'Fear of change' } } },
    { id: 'wands-3', name: { vi: 'Ba Gậy', en: 'Three of Wands' }, image: '/assets/tarot/wands-03.png', arcana: 'minor', number: 3,
      meanings: { upright: { vi: 'Mở rộng, tiến bộ', en: 'Expansion, progress' }, reversed: { vi: 'Trở ngại, trì hoãn', en: 'Obstacles, delays' } } },
    { id: 'wands-4', name: { vi: 'Bốn Gậy', en: 'Four of Wands' }, image: '/assets/tarot/wands-04.png', arcana: 'minor', number: 4,
      meanings: { upright: { vi: 'Ăn mừng, hài hòa', en: 'Celebration, harmony' }, reversed: { vi: 'Xung đột gia đình', en: 'Family conflict' } } },
    { id: 'wands-5', name: { vi: 'Năm Gậy', en: 'Five of Wands' }, image: '/assets/tarot/wands-05.png', arcana: 'minor', number: 5,
      meanings: { upright: { vi: 'Cạnh tranh, xung đột', en: 'Competition, conflict' }, reversed: { vi: 'Hòa giải', en: 'Reconciliation' } } },
    { id: 'wands-6', name: { vi: 'Sáu Gậy', en: 'Six of Wands' }, image: '/assets/tarot/wands-06.png', arcana: 'minor', number: 6,
      meanings: { upright: { vi: 'Chiến thắng, công nhận', en: 'Victory, recognition' }, reversed: { vi: 'Thất bại', en: 'Failure' } } },
    { id: 'wands-7', name: { vi: 'Bảy Gậy', en: 'Seven of Wands' }, image: '/assets/tarot/wands-07.png', arcana: 'minor', number: 7,
      meanings: { upright: { vi: 'Bảo vệ, kiên trì', en: 'Defense, perseverance' }, reversed: { vi: 'Bỏ cuộc', en: 'Giving up' } } },
    { id: 'wands-8', name: { vi: 'Tám Gậy', en: 'Eight of Wands' }, image: '/assets/tarot/wands-08.png', arcana: 'minor', number: 8,
      meanings: { upright: { vi: 'Tốc độ, hành động', en: 'Speed, action' }, reversed: { vi: 'Trì hoãn', en: 'Delays' } } },
    { id: 'wands-9', name: { vi: 'Chín Gậy', en: 'Nine of Wands' }, image: '/assets/tarot/wands-09.png', arcana: 'minor', number: 9,
      meanings: { upright: { vi: 'Kiên cường, bền bỉ', en: 'Resilience, persistence' }, reversed: { vi: 'Kiệt sức', en: 'Exhaustion' } } },
    { id: 'wands-10', name: { vi: 'Mười Gậy', en: 'Ten of Wands' }, image: '/assets/tarot/wands-10.png', arcana: 'minor', number: 10,
      meanings: { upright: { vi: 'Gánh nặng, trách nhiệm', en: 'Burden, responsibility' }, reversed: { vi: 'Giải tỏa gánh nặng', en: 'Releasing burden' } } },
    { id: 'wands-page', name: { vi: 'Thị Đồng Gậy', en: 'Page of Wands' }, image: '/assets/tarot/wands-11.png', arcana: 'minor', number: 11,
      meanings: { upright: { vi: 'Khám phá, nhiệt huyết', en: 'Exploration, enthusiasm' }, reversed: { vi: 'Thiếu định hướng', en: 'Lack of direction' } } },
    { id: 'wands-knight', name: { vi: 'Hiệp Sĩ Gậy', en: 'Knight of Wands' }, image: '/assets/tarot/wands-12.png', arcana: 'minor', number: 12,
      meanings: { upright: { vi: 'Năng lượng, đam mê', en: 'Energy, passion' }, reversed: { vi: 'Nóng vội', en: 'Haste' } } },
    { id: 'wands-queen', name: { vi: 'Hoàng Hậu Gậy', en: 'Queen of Wands' }, image: '/assets/tarot/wands-13.png', arcana: 'minor', number: 13,
      meanings: { upright: { vi: 'Tự tin, quyết đoán', en: 'Confidence, determination' }, reversed: { vi: 'Ghen tị', en: 'Jealousy' } } },
    { id: 'wands-king', name: { vi: 'Hoàng Đế Gậy', en: 'King of Wands' }, image: '/assets/tarot/wands-14.png', arcana: 'minor', number: 14,
      meanings: { upright: { vi: 'Lãnh đạo, tầm nhìn', en: 'Leadership, vision' }, reversed: { vi: 'Độc đoán', en: 'Tyranny' } } },

    // Minor Arcana - Cups (14 cards)
    { id: 'cups-ace', name: { vi: 'Át Cốc', en: 'Ace of Cups' }, image: '/assets/tarot/cups-01.png', arcana: 'minor', number: 1,
      meanings: { upright: { vi: 'Tình yêu mới, cảm xúc', en: 'New love, emotions' }, reversed: { vi: 'Cảm xúc bị chặn', en: 'Blocked emotions' } } },
    { id: 'cups-2', name: { vi: 'Hai Cốc', en: 'Two of Cups' }, image: '/assets/tarot/cups-02.png', arcana: 'minor', number: 2,
      meanings: { upright: { vi: 'Kết nối, đối tác', en: 'Connection, partnership' }, reversed: { vi: 'Mất cân bằng', en: 'Imbalance' } } },
    { id: 'cups-3', name: { vi: 'Ba Cốc', en: 'Three of Cups' }, image: '/assets/tarot/cups-03.png', arcana: 'minor', number: 3,
      meanings: { upright: { vi: 'Ăn mừng, tình bạn', en: 'Celebration, friendship' }, reversed: { vi: 'Cô lập', en: 'Isolation' } } },
    { id: 'cups-4', name: { vi: 'Bốn Cốc', en: 'Four of Cups' }, image: '/assets/tarot/cups-04.png', arcana: 'minor', number: 4,
      meanings: { upright: { vi: 'Suy ngẫm, thờ ơ', en: 'Contemplation, apathy' }, reversed: { vi: 'Nhận ra cơ hội', en: 'Recognizing opportunity' } } },
    { id: 'cups-5', name: { vi: 'Năm Cốc', en: 'Five of Cups' }, image: '/assets/tarot/cups-05.png', arcana: 'minor', number: 5,
      meanings: { upright: { vi: 'Mất mát, tiếc nuối', en: 'Loss, regret' }, reversed: { vi: 'Chấp nhận, tiến về phía trước', en: 'Acceptance, moving on' } } },
    { id: 'cups-6', name: { vi: 'Sáu Cốc', en: 'Six of Cups' }, image: '/assets/tarot/cups-06.png', arcana: 'minor', number: 6,
      meanings: { upright: { vi: 'Hoài niệm, tuổi thơ', en: 'Nostalgia, childhood' }, reversed: { vi: 'Sống trong quá khứ', en: 'Living in the past' } } },
    { id: 'cups-7', name: { vi: 'Bảy Cốc', en: 'Seven of Cups' }, image: '/assets/tarot/cups-07.png', arcana: 'minor', number: 7,
      meanings: { upright: { vi: 'Ảo tưởng, lựa chọn', en: 'Illusion, choices' }, reversed: { vi: 'Rõ ràng, quyết định', en: 'Clarity, decision' } } },
    { id: 'cups-8', name: { vi: 'Tám Cốc', en: 'Eight of Cups' }, image: '/assets/tarot/cups-08.png', arcana: 'minor', number: 8,
      meanings: { upright: { vi: 'Rời bỏ, tìm kiếm', en: 'Walking away, searching' }, reversed: { vi: 'Sợ thay đổi', en: 'Fear of change' } } },
    { id: 'cups-9', name: { vi: 'Chín Cốc', en: 'Nine of Cups' }, image: '/assets/tarot/cups-09.png', arcana: 'minor', number: 9,
      meanings: { upright: { vi: 'Mãn nguyện, ước mơ thành hiện thực', en: 'Contentment, wishes fulfilled' }, reversed: { vi: 'Không hài lòng', en: 'Dissatisfaction' } } },
    { id: 'cups-10', name: { vi: 'Mười Cốc', en: 'Ten of Cups' }, image: '/assets/tarot/cups-10.png', arcana: 'minor', number: 10,
      meanings: { upright: { vi: 'Hạnh phúc gia đình', en: 'Family happiness' }, reversed: { vi: 'Bất hòa gia đình', en: 'Family discord' } } },
    { id: 'cups-page', name: { vi: 'Thị Đồng Cốc', en: 'Page of Cups' }, image: '/assets/tarot/cups-11.png', arcana: 'minor', number: 11,
      meanings: { upright: { vi: 'Sáng tạo, trực giác', en: 'Creativity, intuition' }, reversed: { vi: 'Chưa trưởng thành', en: 'Immaturity' } } },
    { id: 'cups-knight', name: { vi: 'Hiệp Sĩ Cốc', en: 'Knight of Cups' }, image: '/assets/tarot/cups-12.png', arcana: 'minor', number: 12,
      meanings: { upright: { vi: 'Lãng mạn, quyến rũ', en: 'Romance, charm' }, reversed: { vi: 'Không thực tế', en: 'Unrealistic' } } },
    { id: 'cups-queen', name: { vi: 'Hoàng Hậu Cốc', en: 'Queen of Cups' }, image: '/assets/tarot/cups-13.png', arcana: 'minor', number: 13,
      meanings: { upright: { vi: 'Từ bi, trực giác', en: 'Compassion, intuition' }, reversed: { vi: 'Quá nhạy cảm', en: 'Oversensitive' } } },
    { id: 'cups-king', name: { vi: 'Hoàng Đế Cốc', en: 'King of Cups' }, image: '/assets/tarot/cups-14.png', arcana: 'minor', number: 14,
      meanings: { upright: { vi: 'Kiểm soát cảm xúc', en: 'Emotional control' }, reversed: { vi: 'Thao túng cảm xúc', en: 'Emotional manipulation' } } },

    // Minor Arcana - Swords (14 cards)
    { id: 'swords-ace', name: { vi: 'Át Kiếm', en: 'Ace of Swords' }, image: '/assets/tarot/swords-01.png', arcana: 'minor', number: 1,
      meanings: { upright: { vi: 'Sự thật, rõ ràng', en: 'Truth, clarity' }, reversed: { vi: 'Nhầm lẫn', en: 'Confusion' } } },
    { id: 'swords-2', name: { vi: 'Hai Kiếm', en: 'Two of Swords' }, image: '/assets/tarot/swords-02.png', arcana: 'minor', number: 2,
      meanings: { upright: { vi: 'Bế tắc, quyết định khó', en: 'Stalemate, difficult decision' }, reversed: { vi: 'Thông tin mới', en: 'New information' } } },
    { id: 'swords-3', name: { vi: 'Ba Kiếm', en: 'Three of Swords' }, image: '/assets/tarot/swords-03.png', arcana: 'minor', number: 3,
      meanings: { upright: { vi: 'Đau khổ, tan vỡ', en: 'Heartbreak, sorrow' }, reversed: { vi: 'Hồi phục', en: 'Recovery' } } },
    { id: 'swords-4', name: { vi: 'Bốn Kiếm', en: 'Four of Swords' }, image: '/assets/tarot/swords-04.png', arcana: 'minor', number: 4,
      meanings: { upright: { vi: 'Nghỉ ngơi, hồi phục', en: 'Rest, recovery' }, reversed: { vi: 'Kiệt sức', en: 'Exhaustion' } } },
    { id: 'swords-5', name: { vi: 'Năm Kiếm', en: 'Five of Swords' }, image: '/assets/tarot/swords-05.png', arcana: 'minor', number: 5,
      meanings: { upright: { vi: 'Xung đột, thắng bằng mọi giá', en: 'Conflict, winning at all costs' }, reversed: { vi: 'Hòa giải', en: 'Reconciliation' } } },
    { id: 'swords-6', name: { vi: 'Sáu Kiếm', en: 'Six of Swords' }, image: '/assets/tarot/swords-06.png', arcana: 'minor', number: 6,
      meanings: { upright: { vi: 'Chuyển đổi, rời đi', en: 'Transition, moving on' }, reversed: { vi: 'Mắc kẹt', en: 'Stuck' } } },
    { id: 'swords-7', name: { vi: 'Bảy Kiếm', en: 'Seven of Swords' }, image: '/assets/tarot/swords-07.png', arcana: 'minor', number: 7,
      meanings: { upright: { vi: 'Lừa dối, chiến lược', en: 'Deception, strategy' }, reversed: { vi: 'Bị phát hiện', en: 'Getting caught' } } },
    { id: 'swords-8', name: { vi: 'Tám Kiếm', en: 'Eight of Swords' }, image: '/assets/tarot/swords-08.png', arcana: 'minor', number: 8,
      meanings: { upright: { vi: 'Bị mắc kẹt, giới hạn', en: 'Trapped, restricted' }, reversed: { vi: 'Giải thoát', en: 'Freedom' } } },
    { id: 'swords-9', name: { vi: 'Chín Kiếm', en: 'Nine of Swords' }, image: '/assets/tarot/swords-09.png', arcana: 'minor', number: 9,
      meanings: { upright: { vi: 'Lo lắng, ác mộng', en: 'Anxiety, nightmares' }, reversed: { vi: 'Hy vọng', en: 'Hope' } } },
    { id: 'swords-10', name: { vi: 'Mười Kiếm', en: 'Ten of Swords' }, image: '/assets/tarot/swords-10.png', arcana: 'minor', number: 10,
      meanings: { upright: { vi: 'Kết thúc đau đớn', en: 'Painful ending' }, reversed: { vi: 'Hồi phục', en: 'Recovery' } } },
    { id: 'swords-page', name: { vi: 'Thị Đồng Kiếm', en: 'Page of Swords' }, image: '/assets/tarot/swords-11.png', arcana: 'minor', number: 11,
      meanings: { upright: { vi: 'Tò mò, thông minh', en: 'Curiosity, intelligence' }, reversed: { vi: 'Tin đồn', en: 'Gossip' } } },
    { id: 'swords-knight', name: { vi: 'Hiệp Sĩ Kiếm', en: 'Knight of Swords' }, image: '/assets/tarot/swords-12.png', arcana: 'minor', number: 12,
      meanings: { upright: { vi: 'Hành động nhanh, tham vọng', en: 'Quick action, ambition' }, reversed: { vi: 'Liều lĩnh', en: 'Reckless' } } },
    { id: 'swords-queen', name: { vi: 'Hoàng Hậu Kiếm', en: 'Queen of Swords' }, image: '/assets/tarot/swords-13.png', arcana: 'minor', number: 13,
      meanings: { upright: { vi: 'Độc lập, thông minh', en: 'Independence, intelligence' }, reversed: { vi: 'Lạnh lùng', en: 'Cold' } } },
    { id: 'swords-king', name: { vi: 'Hoàng Đế Kiếm', en: 'King of Swords' }, image: '/assets/tarot/swords-14.png', arcana: 'minor', number: 14,
      meanings: { upright: { vi: 'Quyền lực trí tuệ', en: 'Intellectual power' }, reversed: { vi: 'Độc tài', en: 'Tyranny' } } },

    // Minor Arcana - Pentacles (14 cards)
    { id: 'pentacles-ace', name: { vi: 'Át Xu', en: 'Ace of Pentacles' }, image: '/assets/tarot/pentacles-01.png', arcana: 'minor', number: 1,
      meanings: { upright: { vi: 'Cơ hội tài chính', en: 'Financial opportunity' }, reversed: { vi: 'Mất cơ hội', en: 'Lost opportunity' } } },
    { id: 'pentacles-2', name: { vi: 'Hai Xu', en: 'Two of Pentacles' }, image: '/assets/tarot/pentacles-02.png', arcana: 'minor', number: 2,
      meanings: { upright: { vi: 'Cân bằng, thích nghi', en: 'Balance, adaptability' }, reversed: { vi: 'Mất cân bằng', en: 'Imbalance' } } },
    { id: 'pentacles-3', name: { vi: 'Ba Xu', en: 'Three of Pentacles' }, image: '/assets/tarot/pentacles-03.png', arcana: 'minor', number: 3,
      meanings: { upright: { vi: 'Làm việc nhóm, kỹ năng', en: 'Teamwork, skill' }, reversed: { vi: 'Thiếu hợp tác', en: 'Lack of teamwork' } } },
    { id: 'pentacles-4', name: { vi: 'Bốn Xu', en: 'Four of Pentacles' }, image: '/assets/tarot/pentacles-04.png', arcana: 'minor', number: 4,
      meanings: { upright: { vi: 'An toàn, kiểm soát', en: 'Security, control' }, reversed: { vi: 'Keo kiệt', en: 'Greed' } } },
    { id: 'pentacles-5', name: { vi: 'Năm Xu', en: 'Five of Pentacles' }, image: '/assets/tarot/pentacles-05.png', arcana: 'minor', number: 5,
      meanings: { upright: { vi: 'Khó khăn tài chính', en: 'Financial hardship' }, reversed: { vi: 'Hồi phục', en: 'Recovery' } } },
    { id: 'pentacles-6', name: { vi: 'Sáu Xu', en: 'Six of Pentacles' }, image: '/assets/tarot/pentacles-06.png', arcana: 'minor', number: 6,
      meanings: { upright: { vi: 'Cho đi, nhận lại', en: 'Giving, receiving' }, reversed: { vi: 'Nợ nần', en: 'Debt' } } },
    { id: 'pentacles-7', name: { vi: 'Bảy Xu', en: 'Seven of Pentacles' }, image: '/assets/tarot/pentacles-07.png', arcana: 'minor', number: 7,
      meanings: { upright: { vi: 'Kiên nhẫn, đầu tư dài hạn', en: 'Patience, long-term investment' }, reversed: { vi: 'Thiếu kiên nhẫn', en: 'Impatience' } } },
    { id: 'pentacles-8', name: { vi: 'Tám Xu', en: 'Eight of Pentacles' }, image: '/assets/tarot/pentacles-08.png', arcana: 'minor', number: 8,
      meanings: { upright: { vi: 'Chăm chỉ, học hỏi', en: 'Hard work, learning' }, reversed: { vi: 'Thiếu tập trung', en: 'Lack of focus' } } },
    { id: 'pentacles-9', name: { vi: 'Chín Xu', en: 'Nine of Pentacles' }, image: '/assets/tarot/pentacles-09.png', arcana: 'minor', number: 9,
      meanings: { upright: { vi: 'Thành công, độc lập', en: 'Success, independence' }, reversed: { vi: 'Quá phụ thuộc', en: 'Over-dependence' } } },
    { id: 'pentacles-10', name: { vi: 'Mười Xu', en: 'Ten of Pentacles' }, image: '/assets/tarot/pentacles-10.png', arcana: 'minor', number: 10,
      meanings: { upright: { vi: 'Thịnh vượng, gia đình', en: 'Wealth, family' }, reversed: { vi: 'Mất mát tài chính', en: 'Financial loss' } } },
    { id: 'pentacles-page', name: { vi: 'Thị Đồng Xu', en: 'Page of Pentacles' }, image: '/assets/tarot/pentacles-11.png', arcana: 'minor', number: 11,
      meanings: { upright: { vi: 'Cơ hội mới, học hỏi', en: 'New opportunity, learning' }, reversed: { vi: 'Thiếu tiến bộ', en: 'Lack of progress' } } },
    { id: 'pentacles-knight', name: { vi: 'Hiệp Sĩ Xu', en: 'Knight of Pentacles' }, image: '/assets/tarot/pentacles-12.png', arcana: 'minor', number: 12,
      meanings: { upright: { vi: 'Chăm chỉ, đáng tin cậy', en: 'Hard-working, reliable' }, reversed: { vi: 'Lười biếng', en: 'Laziness' } } },
    { id: 'pentacles-queen', name: { vi: 'Hoàng Hậu Xu', en: 'Queen of Pentacles' }, image: '/assets/tarot/pentacles-13.png', arcana: 'minor', number: 13,
      meanings: { upright: { vi: 'Nuôi dưỡng, thực tế', en: 'Nurturing, practical' }, reversed: { vi: 'Quá vật chất', en: 'Too materialistic' } } },
    { id: 'pentacles-king', name: { vi: 'Hoàng Đế Xu', en: 'King of Pentacles' }, image: '/assets/tarot/pentacles-14.png', arcana: 'minor', number: 14,
      meanings: { upright: { vi: 'Thành công tài chính', en: 'Financial success' }, reversed: { vi: 'Tham lam', en: 'Greed' } } }
];

// Helper functions
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function getRandomOrientation(): CardOrientation {
    return Math.random() > 0.7 ? 'reversed' : 'upright';
}

export function getCardById(id: string): TarotCard | undefined {
    return TAROT_CARDS.find(c => c.id === id);
}

// Service class
export class TarotService {
    private static API_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/tarot`;
    private static readonly COST = 50; // Gold cost per reading

    static async getReading(request: TarotReadingRequest): Promise<TarotReadingResponse> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: 'Chưa đăng nhập!' };
        }

        try {
            const response = await fetch(`${this.API_URL}/interpret`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Lỗi khi xem bài');
            }

            const data = await response.json();
            return {
                success: true,
                interpretation: data.interpretation,
                remainingGold: data.remainingGold
            };
        } catch (error: any) {
            console.error('Tarot reading error:', error);
            return { success: false, error: error.message || 'Có lỗi xảy ra' };
        }
    }

    static getCost(): number {
        return this.COST;
    }
}
