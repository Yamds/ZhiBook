// 图标目录（手工维护）：Iconify 精选子集，共两个集合：
//   mdi            工程 UI 图标 + 内置分类 + 绝大多数选择器候选（默认集合）
//   simple-icons   仅支付 / 消费品牌图标（MDI 没有品牌图标，见 PICKER_GROUPS 的「支付品牌」）
//
// 分三块：
//   UI_ICONS                工程自身 UI 图标（导航 / 控件 / 状态 / 设置项）
//   DEFAULT_CATEGORIES      内置分类（稳定 id + 名称 + 默认图标），Rust 种子数据同源
//   PICKER_GROUPS           分类图标选择器的分组目录（中文分组 + 别名）
//
// 新增图标：写进任意一块 → 运行 `pnpm run icons`。脚本会：
//   1. 校验每个名字都存在于对应集合（不存在就报错退出）
//   2. 解析别名（alias → parent），保证渲染时一定有 body
//   3. 生成 src/assets/icons/mdi-subset.json 与 si-subset.json（离线渲染用）
//   4. 生成 src/core/design/icons.generated.ts（IconName 联合类型 + 选择器目录）
//   5. 生成 crates/tk-ledger/src/seed_categories.generated.rs（内置分类种子数据）
//
// mdi 图标名不带前缀，脚本统一补 `mdi:`；simple-icons 分组用 `collection` 字段切换集合，
// 名字不带前缀，脚本补 `simple-icons:`。这样目录文件里不会出现前缀笔误。

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
    clock: 'clock-outline',

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

    // 设置 · 功能页（P10+：固定收支 / 提醒 / 密码锁 / 导入导出 / 云端备份）
    repeat: 'repeat',
    bell: 'bell-outline',
    lock: 'lock-outline',
    shieldLock: 'shield-lock-outline',
    cloudUpload: 'cloud-upload-outline',
    databaseExport: 'database-export-outline',
    databaseImport: 'database-import-outline',
    key: 'key-outline',

    // 设置 · 关于 / 帮助
    guide: 'school-outline',
    help: 'help-circle-outline',
    license: 'license',
    openInNew: 'open-in-new',
    heart: 'heart-outline',
    github: 'github',
};

/** 内置分类默认图标：与 BRD 第 6 章的推荐表一一对应。 */
/**
 * 内置分类（顺序即宫格顺序）。
 *
 * - id：稳定主键，种子数据落库后不得改名（历史账单按它关联）
 * - name：展示名（同组内唯一）
 * - icon：不带 `mdi:` 前缀，生成脚本统一补
 *
 * 数量基线：支出 37 / 收入 10（见 BRD 4.1 FR-ADD-4/5）。
 */
export const DEFAULT_CATEGORIES = {
    expense: [
        { id: 'food', name: '餐饮', icon: 'noodles' },
        { id: 'shopping', name: '购物', icon: 'cart-outline' },
        { id: 'daily', name: '日用', icon: 'paper-roll-outline' },
        { id: 'transport', name: '交通', icon: 'bus' },
        { id: 'vegetable', name: '蔬菜', icon: 'carrot' },
        { id: 'fruit', name: '水果', icon: 'food-apple' },
        { id: 'snack', name: '零食', icon: 'candy' },
        { id: 'sport', name: '运动', icon: 'run' },
        { id: 'entertainment', name: '娱乐', icon: 'gamepad-variant-outline' },
        { id: 'telecom', name: '通讯', icon: 'phone-outline' },
        { id: 'clothing', name: '服饰', icon: 'tshirt-crew-outline' },
        { id: 'beauty', name: '美容', icon: 'lipstick' },
        { id: 'housing', name: '住房', icon: 'home-city-outline' },
        { id: 'family', name: '家庭', icon: 'sofa-outline' },
        { id: 'social', name: '社交', icon: 'account-group-outline' },
        { id: 'travel', name: '旅行', icon: 'bag-suitcase-outline' },
        { id: 'tobacco_alcohol', name: '烟酒', icon: 'glass-wine' },
        { id: 'digital', name: '数码', icon: 'laptop' },
        { id: 'car', name: '汽车', icon: 'car' },
        { id: 'medical', name: '医疗', icon: 'medical-bag' },
        { id: 'books', name: '书籍', icon: 'book-open-page-variant-outline' },
        { id: 'study', name: '学习', icon: 'school-outline' },
        { id: 'pet', name: '宠物', icon: 'paw' },
        { id: 'gift_money', name: '礼金', icon: 'cash-multiple' },
        { id: 'gift', name: '礼品', icon: 'gift-outline' },
        { id: 'office', name: '办公', icon: 'briefcase-outline' },
        { id: 'repair', name: '维修', icon: 'wrench-outline' },
        { id: 'donate', name: '捐赠', icon: 'hand-heart-outline' },
        { id: 'lottery', name: '彩票', icon: 'ticket-percent' },
        { id: 'red_packet', name: '红包', icon: 'gift-open-outline' },
        { id: 'express', name: '快递', icon: 'package-variant-closed' },
        { id: 'other', name: '其它', icon: 'dots-horizontal-circle-outline' },
        { id: 'repay', name: '还款', icon: 'cash-refund' },
        { id: 'lend_out', name: '借出', icon: 'hand-coin-outline' },
        { id: 'drink', name: '饮品', icon: 'coffee' },
        { id: 'fandom', name: '追星', icon: 'star-outline' },
        { id: 'game', name: '游戏', icon: 'controller-classic-outline' },
    ],
    income: [
        { id: 'salary', name: '工资', icon: 'wallet-outline' },
        { id: 'red_packet', name: '红包', icon: 'gift-open-outline' },
        { id: 'rent', name: '租金', icon: 'home-currency-usd' },
        { id: 'gift_money', name: '礼金', icon: 'cash-multiple' },
        { id: 'dividend', name: '分红', icon: 'chart-donut' },
        { id: 'invest', name: '理财', icon: 'finance' },
        { id: 'bonus', name: '年终奖', icon: 'trophy-outline' },
        { id: 'other', name: '其它', icon: 'dots-horizontal-circle-outline' },
        { id: 'borrow_in', name: '借入', icon: 'hand-coin-outline' },
        { id: 'repay', name: '还款', icon: 'cash-refund' },
    ],
};

/**
 * 图标选择器目录。
 *
 * - id：稳定分组 id（**进 i18n**：界面文案走 `iconGroup.<id>`，别把 label 当 key）
 * - label：中文分组名（作为 i18n 中文取值来源 + 搜索别名，不进代码逻辑）
 * - icons：候选图标名
 * - aliases：图标 → 中文别名（搜索用，可选）
 */
export const PICKER_GROUPS = [
    {
        id: 'payment',
        label: '支付与账户',
        icons: [
            // 银行 / 卡
            'bank', 'bank-outline', 'bank-transfer', 'credit-card', 'credit-card-outline',
            'credit-card-chip-outline', 'credit-card-multiple-outline', 'credit-card-wireless-outline',
            'credit-card-scan-outline', 'credit-card-plus-outline', 'credit-card-clock-outline',
            // 钱包 / 现金 / 储蓄
            'wallet', 'wallet-outline', 'wallet-giftcard', 'wallet-travel', 'cash', 'cash-multiple',
            'cash-fast', 'cash-register', 'coins-outline', 'piggy-bank-outline', 'safe-square-outline',
            // 手机支付 / 扫码
            'qrcode-scan', 'contactless-payment', 'account-payment-outline', 'payment', 'cellphone',
            // 币种 / 借贷 / 票据
            'currency-cny', 'hand-coin-outline', 'cash-refund', 'receipt-text-outline',
            'percent-outline', 'chart-line', 'storefront-outline',
        ],
        aliases: {
            bank: ['银行'],
            'bank-outline': ['银行', '储蓄卡'],
            'bank-transfer': ['转账', '汇款'],
            'credit-card': ['银行卡', '信用卡'],
            'credit-card-outline': ['银行卡', '信用卡'],
            'credit-card-chip-outline': ['芯片卡', '储蓄卡'],
            'credit-card-multiple-outline': ['多张卡', '卡包'],
            'credit-card-wireless-outline': ['闪付', '云闪付'],
            'credit-card-scan-outline': ['刷卡机', 'POS'],
            wallet: ['钱包'],
            'wallet-outline': ['钱包', '零钱', '余额'],
            'wallet-giftcard': ['储值卡', '礼品卡'],
            'wallet-travel': ['交通卡', '旅行金'],
            cash: ['现金'],
            'cash-multiple': ['现金', '备用金'],
            'cash-fast': ['快钱', '零钱'],
            'cash-register': ['收银', '收款'],
            'coins-outline': ['硬币', '零钱'],
            'piggy-bank-outline': ['存钱罐', '储蓄'],
            'safe-square-outline': ['保险箱', '存款'],
            'qrcode-scan': ['扫码支付', '二维码', '收款码'],
            'contactless-payment': ['闪付', 'NFC', '云闪付'],
            'account-payment-outline': ['支付', '付款', '网银'],
            payment: ['支付', '付款'],
            cellphone: ['手机', '手机银行'],
            'currency-cny': ['人民币', '钱'],
            'hand-coin-outline': ['借出', '外借'],
            'cash-refund': ['还款', '退款'],
            'receipt-text-outline': ['账单', '票据'],
            'percent-outline': ['利率', '手续费'],
            'chart-line': ['收益', '理财'],
            'storefront-outline': ['商户', '店铺'],
        },
    },
    {
        id: 'paymentBrand',
        label: '支付品牌',
        collection: 'simple-icons',
        icons: [
            'alipay', 'wechat', 'visa', 'mastercard', 'applepay', 'googlepay', 'paypal', 'stripe', 'qq',
        ],
        aliases: {
            alipay: ['支付宝'],
            wechat: ['微信', '微信支付'],
            visa: ['Visa', '维萨'],
            mastercard: ['万事达', '万事达卡'],
            applepay: ['Apple Pay', '苹果支付'],
            googlepay: ['Google Pay', '谷歌支付'],
            paypal: ['PayPal', '贝宝'],
            stripe: ['Stripe'],
            qq: ['QQ', '腾讯QQ'],
        },
    },
    {
        id: 'food',
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
        id: 'shopping',
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
        id: 'daily',
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
        id: 'transport',
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
        id: 'entertainment',
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
        id: 'sport',
        label: '运动',
        icons: [
            'run', 'run-fast', 'basketball', 'soccer', 'tennis', 'badminton',
            'volleyball', 'swim', 'yoga', 'dumbbell', 'weight-lifter', 'hiking',
            'ski', 'skateboard', 'karate', 'boxing-glove', 'meditation', 'bike',
        ],
        aliases: { run: ['跑步', '运动'], swim: ['游泳'], yoga: ['瑜伽'] },
    },
    {
        id: 'medical',
        label: '医疗',
        icons: [
            'medical-bag', 'hospital-box-outline', 'pill', 'thermometer', 'stethoscope',
            'bandage', 'needle', 'heart-pulse', 'syringe', 'tooth-outline',
            'account-injury-outline', 'wheelchair-accessibility',
        ],
        aliases: { 'medical-bag': ['看病', '医院'], pill: ['买药', '药'] },
    },
    {
        id: 'study',
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
        id: 'office',
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
        id: 'digital',
        label: '数码',
        icons: [
            'laptop', 'cellphone', 'tablet', 'watch-variant', 'camera-outline', 'headset',
            'router-wireless', 'usb-flash-drive-outline', 'monitor', 'keyboard-outline',
            'mouse', 'speaker', 'drone', 'virtual-reality',
        ],
        aliases: { laptop: ['电脑'], cellphone: ['手机'], headset: ['耳机'] },
    },
    {
        id: 'social',
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
        id: 'finance',
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
        id: 'pet',
        label: '宠物',
        icons: ['paw', 'paw-outline', 'dog', 'dog-side', 'cat', 'bird', 'fish', 'rabbit', 'bone'],
        aliases: { paw: ['宠物', '猫狗'], dog: ['狗'], cat: ['猫'] },
    },
    {
        id: 'travel',
        label: '旅行',
        icons: [
            'bag-suitcase-outline', 'bag-suitcase', 'airplane', 'earth', 'map-outline',
            'map-legend', 'passport', 'beach', 'tent', 'camera-outline',
            'compass-outline', 'image-filter-hdr', 'palm-tree', 'sail-boat', 'binoculars',
        ],
        aliases: { 'bag-suitcase-outline': ['旅行', '行李'], earth: ['地球', '出国'], tent: ['露营'] },
    },
    {
        id: 'clothing',
        label: '穿戴',
        icons: [
            'tshirt-crew-outline', 'tshirt-v-outline', 'shoe-sneaker', 'shoe-heel',
            'hat-fedora', 'sunglasses', 'glasses', 'watch', 'lipstick',
            'face-woman-shimmer', 'face-man-shimmer', 'tie', 'ring',
        ],
        aliases: { 'tshirt-crew-outline': ['衣服', '服装'], 'shoe-sneaker': ['鞋'], lipstick: ['化妆品', '口红'] },
    },
    {
        id: 'housing',
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
        id: 'other',
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
