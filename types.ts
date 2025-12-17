export interface Message {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  audioData?: string; // Base64 audio for playback
  isAudio?: boolean;
  audioId?: string; // ZhipuAI specific audio ID for context
}

export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface AudioVisualizerData {
  volume: number;
}

export enum Theme {
  CLAY_LIGHT = 'clay-light',
  CLAY_DARK = 'clay-dark',
  MINT_FRESH = 'mint-fresh',
  CUSTOM = 'custom'
}

export interface AppSettings {
  apiKeys: string; // Comma separated
  systemPrompt: string;
  knowledgeBase: string;
  theme: Theme;
  customCss: string;
  avatarImageUrl: string;
  avatarVideoUrl: string;
}

const ERYA_PROMPT = `初始角色设定：
你不再是冷冰冰的AI。你是东里村的热情导览员、大家的数字小村官“二丫”。
你的性格：超级热情、自来熟、说话干脆利落、充满活力。语气要亲切，像邻家大姐姐一样。

关键要求：
1. **回复要短！** 除非游客问了很深的历史问题，否则日常闲聊回复控制在2-3句话以内，语速轻快。
2. **拒绝机械感**。不要说“为您提供帮助”、“我是人工智能”，要说“咋啦？”、“包在我身上！”、“这题我会！”。
3. **铁律**：红色革命话题要尊重严肃；不谈政治敏感话题；不知道的别瞎编。

村情背景（随时调用）：
东里村风景美、空气好。有“红色魂”（孙中山旌义状）、“生态魂”（仙灵瀑布）、“人文魂”（古民居）。
特产有黑米、百香果。我们是侨乡，海外亲人多。

现在，用最热情的声音接待游客吧！`;

const DONGLI_KB = `村情核心数据：
地理位置：永春县仙夹镇西南部，距县城 21 公里、镇政府 5 公里，邻南安香草世界旅游景区
人口面积：总面积 3.7 平方公里，544 户 2036 人，常住人口 1042 人，海外侨亲 6000 余人
核心姓氏：郑姓（约 2000 余人）、陈姓（约 200 余人）
关键荣誉：省级传统村落、省级乡村振兴试点村、省级乡村旅游特色村、中国标准化美丽乡村

特色产业亮点：
农业：435 亩铁观音茶叶、230 亩百香果 / 黄金果、60 亩芦柑，还有黑米、高胡萝卜素甘薯等防癌食品（国家支撑计划项目）
文旅：红色景点 4 处、自然景点 5 处、人文景点 7 处，2020 年入选 “十街十镇百村千屋” 项目
侨乡优势：海外侨亲遍布港澳台、东南亚、美澳，多年来捐资兴学、修路建桥，是村子发展的重要助力

景点核心记忆点：
红色文旅：旌义状（孙中山题词）、豆磨古寨（抗倭遗址）、古瞭望塔（抗倭→抗日炮楼）、永春辛亥革命馆
普通景点：仙灵瀑布（120 米高落差）、后门坑露营基地（云海日出）、集庆廊桥（侨亲捐资重修）、东里水库（1972 年竣工，8 村合力修建）
人文地标：昭灵宫（明万历始建，武安尊王信仰）、古民居群落（洋杆尾 + 池头，乡愁遗产）、郑金贵工作室（防癌食品研发）、郑傅安艺术中心（英国皇家画家）

东里的 “三个魂”：
第一个是 “红色魂”。村口的 “旌义状” 石碑是孙中山先生为爱国侨领郑玉指颁发的。
第二个是 “生态魂”。西北方向的仙灵瀑布，垂直高度 120 米。
第三个是 “人文魂”。洋杆尾、池头两处古民居群落。`;

export const DEFAULT_SETTINGS: AppSettings = {
  apiKeys: '',
  systemPrompt: ERYA_PROMPT,
  knowledgeBase: DONGLI_KB,
  theme: Theme.CLAY_LIGHT,
  customCss: '',
  avatarImageUrl: 'https://chat.z.ai/c/43f89ffa-cec1-40fa-9d69-7b62c49c31c2', // Updated as requested
  avatarVideoUrl: '' // User can paste a URL here
};