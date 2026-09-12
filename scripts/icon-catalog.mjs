// 图标目录（手工维护）：Iconify MDI 集合的精选子集。
//
// 分三块：
//   UI_ICONS                工程自身 UI 图标（导航 / 控件 / 状态 / 设置项）
//   DEFAULT_CATEGORY_ICONS  内置分类的默认图标（P3 种子数据会用到同一份名字）
//   PICKER_GROUPS           分类图标选择器的分组目录（中文分组 + 别名）
//
// 新增图标：写进任意一块 → 运行 `pnpm run icons`。脚本会：
//   1. 校验每个名字都存在于 @iconify-json/mdi（不存在就报错退出）
//   2. 解析 mdi 别名（alias → parent），保证渲染时一定有 body
//   3. 生成 src/assets/icons/mdi-subset.json（离线渲染用）
//   4. 生成 src/core/design/icons.generated.ts（IconName 联合类型 + 选择器目录）
//
// 图标名不带 `mdi:` 前缀，脚本统一补；这样目录文件里不会出现前缀笔误。

/** 工程 UI 图标。 */
export const UI_ICONS = {
    // 底部导航 + 设置
    bills: 'receipt-text-outline',
    details: 'format-list-bulleted',
    calendar: 'calendar-month-outline',
    add: 'plus-circle-outline',
    assets: 'wallet-outline',
    settings: 'cog-outline',

    // 方向 / 状态
    chevronLeft: 'chevron-left',
    chevronRight: 'chevron-right',
    chevronDown: 'chevron-down',
    chevronUp: 'chevron-up',
    arrowRight: 'arrow-right',
    check: 'check',
    close: 'close',
    plus: 'plus',
    minus: 'minus',
    dot: 'circle',
    backspace: 'backspace-outline',
    calendarToday: 'calendar-today',

    // 通用操作
    edit: 'pencil-outline',
    trash: 'trash-can-outline',
    copy: 'content-copy',
    search: 'magnify',
    more: 'dots-horizontal',
    drag: 'drag-vertical',
    camera: 'camera-outline',
    image: 'image-outline',
    refresh: 'refresh',

    // 反馈
    info: 'information-outline',
    success: 'check-circle-outline',
    warning: 'alert-outline',
    danger: 'alert-circle-outline',

    // 设置项视觉
    motionElegant: 'feather',
    motionStandard: 'auto-fix',
    motionRich: 'creation',
    radiusSquare: 'square-outline',
    radiusStandard: 'rectangle-outline',
    radiusRound: 'circle-outline',
};

/** 内置分类默认图标：与 BRD 第 6 章的推荐表一一对应。 */
export const DEFAULT_CATEGORY_ICONS = {
    expense: {
        餐饮: 'noodles',
        购物: 'cart-outline',
        日用: 'paper-roll-outline',
        交通: 'bus',
        蔬菜: 'carrot',
        水果: 'food-apple',
        零食: 'candy',
        运动: 'run',
        娱乐: 'gamepad-variant-outline',
        通讯: 'phone-outline',
        服饰: 'tshirt-crew-outline',
        美容: 'lipstick',
        住房: 'home-city-outline',
        家庭: 'sofa-outline',
        社交: 'account-group-outline',
        旅行: 'bag-suitcase-outline',
        烟酒: 'glass-wine',
        数码: 'laptop',
        汽车: 'car',
        医疗: 'medical-bag',
        书籍: 'book-open-page-variant-outline',
        学习: 'school-outline',
        宠物: 'paw',
        礼金: 'cash-multiple',
        礼品: 'gift-outline',
        办公: 'briefcase-outline',
        维修: 'wrench-outline',
        捐赠: 'hand-heart-outline',
        彩票: 'ticket-percent',
        红包: 'gift-open-outline',
        快递: 'package-variant-closed',
        其它: 'dots-horizontal-circle-outline',
        还款: 'cash-refund',
        借出: 'hand-coin-outline',
        饮品: 'coffee',
        追星: 'star-outline',
        游戏: 'controller-classic-outline',
    },
    income: {
        工资: 'wallet-outline',
        红包: 'gift-open-outline',
        租金: 'home-currency-usd',
        礼金: 'cash-multiple',
        分红: 'chart-donut',
        理财: 'finance',
        年终奖: 'trophy-outline',
        其它: 'dots-horizontal-circle-outline',
        借入: 'hand-coin-outline',
        还款: 'cash-refund',
    },
};

/**
 * 图标选择器目录。
 *
 * - label：中文分组名（选择器里的分组标签）
 * - icons：候选图标名
 * - aliases：图标 → 中文别名（搜索用，可选）
 */
export const PICKER_GROUPS = [
    {
        label: '餐饮',
        icons: [
            'noodles', 'rice', 'food-apple', 'food-croissant', 'pizza', 'hamburger',
            'french-fries', 'ice-cream', 'cupcake', 'cake-variant', 'cookie', 'candy',
            'coffee', 'tea', 'cup', 'glass-mug-variant', 'glass-wine', 'beer',
            'bottle-soda', 'bottle-wine', 'silverware-fork-knife', 'pot-steam',
            'chef-hat', 'popcorn', 'food-drumstick', 'chili-hot', 'corn', 'carrot',
            'mushroom', 'bread-slice',
        ],
        aliases: { noodles: ['面', '饭'], coffee: ['咖啡'], 'glass-wine': ['酒'], beer: ['啤酒'] },
    },
    {
        label: '购物',
        icons: [
            'cart-outline', 'cart-variant', 'basket-outline', 'shopping-outline',
            'tag-outline', 'tag-heart-outline', 'sale-outline', 'storefront-outline',
            'gift-outline', 'gift-open-outline', 'package-variant-closed',
            'credit-card-outline', 'cash', 'cash-multiple', 'wallet-outline',
            'piggy-bank-outline', 'barcode', 'qrcode',
        ],
        aliases: { 'cart-outline': ['购物车', '买东西'], 'gift-outline': ['礼物'] },
    },
    {
        label: '日用',
        icons: [
            'paper-roll-outline', 'toothbrush', 'hand-wash-outline', 'spray-bottle', 'broom',
            'washing-machine', 'vacuum-outline', 'paper-towels-outline', 'bucket-outline', 'lamp-outline',
            'lightbulb-outline', 'power-plug-outline', 'water-outline', 'trash-can-outline',
            'toilet-paper-outline', 'iron-outline', 'hanger', 'mirror', 'stove', 'microwave',
            'fridge-outline', 'shower-head',
        ],
        aliases: { 'paper-roll-outline': ['纸巾', '卫生纸'], 'hand-wash-outline': ['香皂', '沐浴露', '洗手液'] },
    },
    {
        label: '交通',
        icons: [
            'bus', 'car', 'taxi', 'train', 'subway-variant', 'tram', 'airplane',
            'bike', 'motorcycle', 'gas-station-outline', 'map-marker-outline',
            'road-variant', 'ferry', 'walk', 'parking', 'ev-station', 'car-wash',
            'traffic-light', 'speedometer', 'train-car',
        ],
        aliases: { bus: ['公交车'], car: ['汽车', '打车'], train: ['火车', '高铁'], airplane: ['飞机'] },
    },
    {
        label: '娱乐',
        icons: [
            'gamepad-variant-outline', 'controller-classic-outline', 'movie-open-outline',
            'music-note', 'music-note-eighth', 'headphones', 'ticket-outline',
            'ticket-percent', 'dice-multiple-outline', 'cards-playing-outline',
            'microphone-outline', 'television-classic', 'party-popper', 'balloon',
            'ferris-wheel', 'poker-chip', 'chess-knight', 'puzzle-outline',
        ],
        aliases: { 'gamepad-variant-outline': ['游戏', '打游戏'], 'movie-open-outline': ['电影'], 'music-note': ['音乐'] },
    },
    {
        label: '运动',
        icons: [
            'run', 'run-fast', 'basketball', 'soccer', 'tennis', 'badminton',
            'volleyball', 'swim', 'yoga', 'dumbbell', 'weight-lifter', 'hiking',
            'ski', 'skateboard', 'karate', 'boxing-glove', 'meditation', 'bike',
        ],
        aliases: { run: ['跑步', '运动'], swim: ['游泳'], yoga: ['瑜伽'] },
    },
    {
        label: '医疗',
        icons: [
            'medical-bag', 'hospital-box-outline', 'pill', 'thermometer', 'stethoscope',
            'bandage', 'needle', 'heart-pulse', 'syringe', 'tooth-outline',
            'account-injury-outline', 'wheelchair-accessibility',
        ],
        aliases: { 'medical-bag': ['看病', '医院'], pill: ['买药', '药'] },
    },
    {
        label: '学习',
        icons: [
            'book-open-page-variant-outline', 'book-open-variant', 'book-outline',
            'school-outline', 'pencil-outline', 'notebook-outline',
            'calculator-variant-outline', 'certificate-outline', 'brain',
            'lightbulb-on-outline', 'translate', 'graduation-cap',
        ],
        aliases: { 'book-open-page-variant-outline': ['书', '看书'], 'school-outline': ['上学', '学费'] },
    },
    {
        label: '办公',
        icons: [
            'briefcase-outline', 'desk', 'printer-outline', 'file-document-outline',
            'folder-outline', 'email-outline', 'phone-outline', 'calendar-check-outline',
            'clipboard-text-outline', 'paperclip', 'postage-stamp', 'pen', 'marker',
            'whiteboard', 'projector', 'monitor-share',
        ],
        aliases: { 'briefcase-outline': ['办公', '工作'], printer: ['打印'] },
    },
    {
        label: '数码',
        icons: [
            'laptop', 'cellphone', 'tablet', 'watch-variant', 'camera-outline', 'headset',
            'router-wireless', 'usb-flash-drive-outline', 'monitor', 'keyboard-outline',
            'mouse', 'speaker', 'drone', 'virtual-reality',
        ],
        aliases: { laptop: ['电脑'], cellphone: ['手机'], headset: ['耳机'] },
    },
    {
        label: '人情',
        icons: [
            'account-group-outline', 'account-multiple-outline', 'hand-heart-outline',
            'hand-heart', 'gift', 'cake-variant-outline', 'heart-outline', 'ring',
            'human-greeting', 'emoji-happy-outline', 'account-heart-outline',
            'account-supervisor-outline', 'phone-classic',
        ],
        aliases: { 'account-group-outline': ['聚会', '社交'], 'cake-variant-outline': ['生日', '蛋糕'], 'hand-heart': ['捐赠', '爱心'] },
    },
    {
        label: '金融',
        icons: [
            'finance', 'chart-line', 'chart-donut', 'chart-pie', 'trending-up',
            'trending-down', 'bank-outline', 'cash-refund', 'hand-coin-outline',
            'hand-coin', 'piggy-bank-outline', 'percent-outline', 'currency-cny',
            'currency-usd', 'receipt-text-outline', 'safe-square-outline',
            'calculator-variant-outline', 'chart-box-outline', 'home-currency-usd',
        ],
        aliases: { finance: ['理财', '基金'], 'bank-outline': ['银行'], 'currency-cny': ['人民币', '钱'] },
    },
    {
        label: '宠物',
        icons: ['paw', 'paw-outline', 'dog', 'dog-side', 'cat', 'bird', 'fish', 'rabbit', 'bone'],
        aliases: { paw: ['宠物', '猫狗'], dog: ['狗'], cat: ['猫'] },
    },
    {
        label: '旅行',
        icons: [
            'bag-suitcase-outline', 'bag-suitcase', 'airplane', 'earth', 'map-outline',
            'map-legend', 'passport', 'beach', 'tent', 'camera-outline',
            'compass-outline', 'image-filter-hdr', 'palm-tree', 'sail-boat', 'binoculars',
        ],
        aliases: { 'bag-suitcase-outline': ['旅行', '行李'], earth: ['地球', '出国'], tent: ['露营'] },
    },
    {
        label: '穿戴',
        icons: [
            'tshirt-crew-outline', 'tshirt-v-outline', 'shoe-sneaker', 'shoe-heel',
            'hat-fedora', 'sunglasses', 'glasses', 'watch', 'lipstick',
            'face-woman-shimmer', 'face-man-shimmer', 'tie', 'ring',
        ],
        aliases: { 'tshirt-crew-outline': ['衣服', '服装'], 'shoe-sneaker': ['鞋'], lipstick: ['化妆品', '口红'] },
    },
    {
        label: '住房',
        icons: [
            'home-outline', 'home-city-outline', 'home-group', 'home-modern',
            'bed-outline', 'bed-king-outline', 'sofa-outline', 'sofa-single-outline',
            'table-furniture', 'chair-outline', 'door', 'window-closed-variant',
            'key-outline', 'garage', 'fence', 'tree-outline', 'flower-outline', 'pool',
        ],
        aliases: { 'home-outline': ['房子', '家'], 'bed-outline': ['床', '住宿'], 'key-outline': ['钥匙', '房租'] },
    },
    {
        label: '其它',
        icons: [
            'star-outline', 'star-four-points-outline', 'heart-outline',
            'lightning-bolt-outline', 'fire', 'water', 'leaf', 'flower',
            'umbrella-outline', 'brush', 'palette-outline', 'magic-staff',
            'robot-outline', 'alarm', 'bell-outline', 'clock-outline',
            'dots-horizontal-circle-outline', 'shape-outline', 'wrench-outline',
            'screwdriver', 'flashlight', 'compass-outline', 'rocket-launch-outline',
            'shield-outline', 'crown-outline', 'diamond-stone', 'weather-sunny',
            'weather-night', 'snowflake', 'atom', 'flask-outline', 'telescope', 'trophy-outline',
        ],
        aliases: { 'star-outline': ['追星', '星星'], fire: ['火'], leaf: ['叶子', '植物'], 'clock-outline': ['时间'] },
    },
];
