// 由 scripts/build-icon-subset.mjs 生成，请勿手改。
// 重新生成：pnpm run icons（目录在 scripts/icon-catalog.mjs）
//
// mdi 全集有 7638 个图标，这里只保留精选子集，
// 渲染数据见 src/assets/icons/mdi-subset.json。

/** 工程内允许使用的图标名（Iconify name，形如 mdi:noodles）。 */
export type IconName =
    | 'mdi:account-group-outline'
    | 'mdi:account-heart-outline'
    | 'mdi:account-injury-outline'
    | 'mdi:account-multiple-outline'
    | 'mdi:account-payment-outline'
    | 'mdi:account-supervisor-outline'
    | 'mdi:airplane'
    | 'mdi:alarm'
    | 'mdi:alert-circle-outline'
    | 'mdi:alert-outline'
    | 'mdi:arrow-right'
    | 'mdi:atom'
    | 'mdi:auto-fix'
    | 'mdi:backspace-outline'
    | 'mdi:badminton'
    | 'mdi:bag-suitcase'
    | 'mdi:bag-suitcase-outline'
    | 'mdi:balloon'
    | 'mdi:bandage'
    | 'mdi:bank'
    | 'mdi:bank-outline'
    | 'mdi:bank-transfer'
    | 'mdi:barcode'
    | 'mdi:basket-outline'
    | 'mdi:basketball'
    | 'mdi:beach'
    | 'mdi:bed-king-outline'
    | 'mdi:bed-outline'
    | 'mdi:beer'
    | 'mdi:bell-outline'
    | 'mdi:bike'
    | 'mdi:binoculars'
    | 'mdi:bird'
    | 'mdi:bone'
    | 'mdi:book-open-page-variant-outline'
    | 'mdi:book-open-variant'
    | 'mdi:book-outline'
    | 'mdi:bottle-soda'
    | 'mdi:bottle-wine'
    | 'mdi:boxing-glove'
    | 'mdi:brain'
    | 'mdi:bread-slice'
    | 'mdi:briefcase-outline'
    | 'mdi:broom'
    | 'mdi:brush'
    | 'mdi:bucket-outline'
    | 'mdi:bus'
    | 'mdi:cake-variant'
    | 'mdi:cake-variant-outline'
    | 'mdi:calculator-variant-outline'
    | 'mdi:calendar-check-outline'
    | 'mdi:calendar-month-outline'
    | 'mdi:calendar-today'
    | 'mdi:camera-outline'
    | 'mdi:candy'
    | 'mdi:car'
    | 'mdi:car-wash'
    | 'mdi:cards-playing-outline'
    | 'mdi:carrot'
    | 'mdi:cart-outline'
    | 'mdi:cart-variant'
    | 'mdi:cash'
    | 'mdi:cash-fast'
    | 'mdi:cash-multiple'
    | 'mdi:cash-refund'
    | 'mdi:cash-register'
    | 'mdi:cat'
    | 'mdi:cellphone'
    | 'mdi:certificate-outline'
    | 'mdi:chair-outline'
    | 'mdi:chart-box-outline'
    | 'mdi:chart-donut'
    | 'mdi:chart-line'
    | 'mdi:chart-pie'
    | 'mdi:check'
    | 'mdi:check-circle-outline'
    | 'mdi:chef-hat'
    | 'mdi:chess-knight'
    | 'mdi:chevron-down'
    | 'mdi:chevron-left'
    | 'mdi:chevron-right'
    | 'mdi:chevron-up'
    | 'mdi:chili-hot'
    | 'mdi:circle'
    | 'mdi:circle-outline'
    | 'mdi:clipboard-text-outline'
    | 'mdi:clock-outline'
    | 'mdi:close'
    | 'mdi:coffee'
    | 'mdi:cog-outline'
    | 'mdi:coins-outline'
    | 'mdi:compass-outline'
    | 'mdi:contactless-payment'
    | 'mdi:content-copy'
    | 'mdi:controller-classic-outline'
    | 'mdi:cookie'
    | 'mdi:corn'
    | 'mdi:creation'
    | 'mdi:credit-card'
    | 'mdi:credit-card-chip-outline'
    | 'mdi:credit-card-clock-outline'
    | 'mdi:credit-card-multiple-outline'
    | 'mdi:credit-card-outline'
    | 'mdi:credit-card-plus-outline'
    | 'mdi:credit-card-scan-outline'
    | 'mdi:credit-card-wireless-outline'
    | 'mdi:crown-outline'
    | 'mdi:cup'
    | 'mdi:cupcake'
    | 'mdi:currency-cny'
    | 'mdi:currency-usd'
    | 'mdi:desk'
    | 'mdi:diamond-stone'
    | 'mdi:dice-multiple-outline'
    | 'mdi:dog'
    | 'mdi:dog-side'
    | 'mdi:door'
    | 'mdi:dots-horizontal'
    | 'mdi:dots-horizontal-circle-outline'
    | 'mdi:drag-vertical'
    | 'mdi:drone'
    | 'mdi:dumbbell'
    | 'mdi:earth'
    | 'mdi:email-outline'
    | 'mdi:emoji-happy-outline'
    | 'mdi:ev-station'
    | 'mdi:face-man-shimmer'
    | 'mdi:face-woman-shimmer'
    | 'mdi:feather'
    | 'mdi:fence'
    | 'mdi:ferris-wheel'
    | 'mdi:ferry'
    | 'mdi:file-document-outline'
    | 'mdi:finance'
    | 'mdi:fire'
    | 'mdi:fish'
    | 'mdi:flashlight'
    | 'mdi:flask-outline'
    | 'mdi:flower'
    | 'mdi:flower-outline'
    | 'mdi:folder-outline'
    | 'mdi:food-apple'
    | 'mdi:food-croissant'
    | 'mdi:food-drumstick'
    | 'mdi:format-list-bulleted'
    | 'mdi:french-fries'
    | 'mdi:fridge-outline'
    | 'mdi:gamepad-variant-outline'
    | 'mdi:garage'
    | 'mdi:gas-station-outline'
    | 'mdi:gift'
    | 'mdi:gift-open-outline'
    | 'mdi:gift-outline'
    | 'mdi:glass-mug-variant'
    | 'mdi:glass-wine'
    | 'mdi:glasses'
    | 'mdi:graduation-cap'
    | 'mdi:hamburger'
    | 'mdi:hand-coin'
    | 'mdi:hand-coin-outline'
    | 'mdi:hand-heart'
    | 'mdi:hand-heart-outline'
    | 'mdi:hand-wash-outline'
    | 'mdi:hanger'
    | 'mdi:hat-fedora'
    | 'mdi:headphones'
    | 'mdi:headset'
    | 'mdi:heart-outline'
    | 'mdi:heart-pulse'
    | 'mdi:hiking'
    | 'mdi:home-city-outline'
    | 'mdi:home-currency-usd'
    | 'mdi:home-group'
    | 'mdi:home-modern'
    | 'mdi:home-outline'
    | 'mdi:hospital-box-outline'
    | 'mdi:human-greeting'
    | 'mdi:ice-cream'
    | 'mdi:image-filter-hdr'
    | 'mdi:image-outline'
    | 'mdi:information-outline'
    | 'mdi:iron-outline'
    | 'mdi:karate'
    | 'mdi:key-outline'
    | 'mdi:keyboard-outline'
    | 'mdi:lamp-outline'
    | 'mdi:laptop'
    | 'mdi:leaf'
    | 'mdi:lightbulb-on-outline'
    | 'mdi:lightbulb-outline'
    | 'mdi:lightning-bolt-outline'
    | 'mdi:lipstick'
    | 'mdi:magic-staff'
    | 'mdi:magnify'
    | 'mdi:map-legend'
    | 'mdi:map-marker-outline'
    | 'mdi:map-outline'
    | 'mdi:marker'
    | 'mdi:medical-bag'
    | 'mdi:meditation'
    | 'mdi:microphone-outline'
    | 'mdi:microwave'
    | 'mdi:minus'
    | 'mdi:mirror'
    | 'mdi:monitor'
    | 'mdi:monitor-share'
    | 'mdi:motorcycle'
    | 'mdi:mouse'
    | 'mdi:movie-open-outline'
    | 'mdi:mushroom'
    | 'mdi:music-note'
    | 'mdi:music-note-eighth'
    | 'mdi:needle'
    | 'mdi:noodles'
    | 'mdi:notebook-outline'
    | 'mdi:package-variant-closed'
    | 'mdi:palette-outline'
    | 'mdi:palm-tree'
    | 'mdi:paper-roll-outline'
    | 'mdi:paper-towels-outline'
    | 'mdi:paperclip'
    | 'mdi:parking'
    | 'mdi:party-popper'
    | 'mdi:passport'
    | 'mdi:paw'
    | 'mdi:paw-outline'
    | 'mdi:payment'
    | 'mdi:pen'
    | 'mdi:pencil-outline'
    | 'mdi:percent-outline'
    | 'mdi:phone-classic'
    | 'mdi:phone-outline'
    | 'mdi:piggy-bank-outline'
    | 'mdi:pill'
    | 'mdi:pizza'
    | 'mdi:plus'
    | 'mdi:plus-circle-outline'
    | 'mdi:poker-chip'
    | 'mdi:pool'
    | 'mdi:popcorn'
    | 'mdi:postage-stamp'
    | 'mdi:pot-steam'
    | 'mdi:power-plug-outline'
    | 'mdi:printer'
    | 'mdi:printer-outline'
    | 'mdi:projector'
    | 'mdi:puzzle-outline'
    | 'mdi:qrcode'
    | 'mdi:qrcode-scan'
    | 'mdi:rabbit'
    | 'mdi:receipt-text-outline'
    | 'mdi:rectangle-outline'
    | 'mdi:refresh'
    | 'mdi:rice'
    | 'mdi:ring'
    | 'mdi:road-variant'
    | 'mdi:robot-outline'
    | 'mdi:rocket-launch-outline'
    | 'mdi:router-wireless'
    | 'mdi:run'
    | 'mdi:run-fast'
    | 'mdi:safe-square-outline'
    | 'mdi:sail-boat'
    | 'mdi:sale-outline'
    | 'mdi:school-outline'
    | 'mdi:screwdriver'
    | 'mdi:shape-outline'
    | 'mdi:shield-outline'
    | 'mdi:shoe-heel'
    | 'mdi:shoe-sneaker'
    | 'mdi:shopping-outline'
    | 'mdi:shower-head'
    | 'mdi:silverware-fork-knife'
    | 'mdi:skateboard'
    | 'mdi:ski'
    | 'mdi:snowflake'
    | 'mdi:soccer'
    | 'mdi:sofa-outline'
    | 'mdi:sofa-single-outline'
    | 'mdi:speaker'
    | 'mdi:speedometer'
    | 'mdi:spray-bottle'
    | 'mdi:square-outline'
    | 'mdi:star-four-points-outline'
    | 'mdi:star-outline'
    | 'mdi:stethoscope'
    | 'mdi:storefront-outline'
    | 'mdi:stove'
    | 'mdi:subway-variant'
    | 'mdi:sunglasses'
    | 'mdi:swim'
    | 'mdi:syringe'
    | 'mdi:table-furniture'
    | 'mdi:tablet'
    | 'mdi:tag-heart-outline'
    | 'mdi:tag-outline'
    | 'mdi:taxi'
    | 'mdi:tea'
    | 'mdi:telescope'
    | 'mdi:television-classic'
    | 'mdi:tennis'
    | 'mdi:tent'
    | 'mdi:thermometer'
    | 'mdi:ticket-outline'
    | 'mdi:ticket-percent'
    | 'mdi:tie'
    | 'mdi:toilet-paper-outline'
    | 'mdi:tooth-outline'
    | 'mdi:toothbrush'
    | 'mdi:traffic-light'
    | 'mdi:train'
    | 'mdi:train-car'
    | 'mdi:tram'
    | 'mdi:translate'
    | 'mdi:trash-can-outline'
    | 'mdi:tree-outline'
    | 'mdi:trending-down'
    | 'mdi:trending-up'
    | 'mdi:trophy-outline'
    | 'mdi:tshirt-crew-outline'
    | 'mdi:tshirt-v-outline'
    | 'mdi:umbrella-outline'
    | 'mdi:usb-flash-drive-outline'
    | 'mdi:vacuum-outline'
    | 'mdi:virtual-reality'
    | 'mdi:volleyball'
    | 'mdi:walk'
    | 'mdi:wallet'
    | 'mdi:wallet-giftcard'
    | 'mdi:wallet-outline'
    | 'mdi:wallet-travel'
    | 'mdi:washing-machine'
    | 'mdi:watch'
    | 'mdi:watch-variant'
    | 'mdi:water'
    | 'mdi:water-outline'
    | 'mdi:weather-night'
    | 'mdi:weather-sunny'
    | 'mdi:wechat'
    | 'mdi:weight-lifter'
    | 'mdi:wheelchair-accessibility'
    | 'mdi:whiteboard'
    | 'mdi:window-closed-variant'
    | 'mdi:wrench-outline'
    | 'mdi:yoga';

/** IconName 的运行时清单（校验 IPC 传回的图标名时用）。 */
export const ICON_NAMES: readonly IconName[] = [
    'mdi:account-group-outline',
    'mdi:account-heart-outline',
    'mdi:account-injury-outline',
    'mdi:account-multiple-outline',
    'mdi:account-payment-outline',
    'mdi:account-supervisor-outline',
    'mdi:airplane',
    'mdi:alarm',
    'mdi:alert-circle-outline',
    'mdi:alert-outline',
    'mdi:arrow-right',
    'mdi:atom',
    'mdi:auto-fix',
    'mdi:backspace-outline',
    'mdi:badminton',
    'mdi:bag-suitcase',
    'mdi:bag-suitcase-outline',
    'mdi:balloon',
    'mdi:bandage',
    'mdi:bank',
    'mdi:bank-outline',
    'mdi:bank-transfer',
    'mdi:barcode',
    'mdi:basket-outline',
    'mdi:basketball',
    'mdi:beach',
    'mdi:bed-king-outline',
    'mdi:bed-outline',
    'mdi:beer',
    'mdi:bell-outline',
    'mdi:bike',
    'mdi:binoculars',
    'mdi:bird',
    'mdi:bone',
    'mdi:book-open-page-variant-outline',
    'mdi:book-open-variant',
    'mdi:book-outline',
    'mdi:bottle-soda',
    'mdi:bottle-wine',
    'mdi:boxing-glove',
    'mdi:brain',
    'mdi:bread-slice',
    'mdi:briefcase-outline',
    'mdi:broom',
    'mdi:brush',
    'mdi:bucket-outline',
    'mdi:bus',
    'mdi:cake-variant',
    'mdi:cake-variant-outline',
    'mdi:calculator-variant-outline',
    'mdi:calendar-check-outline',
    'mdi:calendar-month-outline',
    'mdi:calendar-today',
    'mdi:camera-outline',
    'mdi:candy',
    'mdi:car',
    'mdi:car-wash',
    'mdi:cards-playing-outline',
    'mdi:carrot',
    'mdi:cart-outline',
    'mdi:cart-variant',
    'mdi:cash',
    'mdi:cash-fast',
    'mdi:cash-multiple',
    'mdi:cash-refund',
    'mdi:cash-register',
    'mdi:cat',
    'mdi:cellphone',
    'mdi:certificate-outline',
    'mdi:chair-outline',
    'mdi:chart-box-outline',
    'mdi:chart-donut',
    'mdi:chart-line',
    'mdi:chart-pie',
    'mdi:check',
    'mdi:check-circle-outline',
    'mdi:chef-hat',
    'mdi:chess-knight',
    'mdi:chevron-down',
    'mdi:chevron-left',
    'mdi:chevron-right',
    'mdi:chevron-up',
    'mdi:chili-hot',
    'mdi:circle',
    'mdi:circle-outline',
    'mdi:clipboard-text-outline',
    'mdi:clock-outline',
    'mdi:close',
    'mdi:coffee',
    'mdi:cog-outline',
    'mdi:coins-outline',
    'mdi:compass-outline',
    'mdi:contactless-payment',
    'mdi:content-copy',
    'mdi:controller-classic-outline',
    'mdi:cookie',
    'mdi:corn',
    'mdi:creation',
    'mdi:credit-card',
    'mdi:credit-card-chip-outline',
    'mdi:credit-card-clock-outline',
    'mdi:credit-card-multiple-outline',
    'mdi:credit-card-outline',
    'mdi:credit-card-plus-outline',
    'mdi:credit-card-scan-outline',
    'mdi:credit-card-wireless-outline',
    'mdi:crown-outline',
    'mdi:cup',
    'mdi:cupcake',
    'mdi:currency-cny',
    'mdi:currency-usd',
    'mdi:desk',
    'mdi:diamond-stone',
    'mdi:dice-multiple-outline',
    'mdi:dog',
    'mdi:dog-side',
    'mdi:door',
    'mdi:dots-horizontal',
    'mdi:dots-horizontal-circle-outline',
    'mdi:drag-vertical',
    'mdi:drone',
    'mdi:dumbbell',
    'mdi:earth',
    'mdi:email-outline',
    'mdi:emoji-happy-outline',
    'mdi:ev-station',
    'mdi:face-man-shimmer',
    'mdi:face-woman-shimmer',
    'mdi:feather',
    'mdi:fence',
    'mdi:ferris-wheel',
    'mdi:ferry',
    'mdi:file-document-outline',
    'mdi:finance',
    'mdi:fire',
    'mdi:fish',
    'mdi:flashlight',
    'mdi:flask-outline',
    'mdi:flower',
    'mdi:flower-outline',
    'mdi:folder-outline',
    'mdi:food-apple',
    'mdi:food-croissant',
    'mdi:food-drumstick',
    'mdi:format-list-bulleted',
    'mdi:french-fries',
    'mdi:fridge-outline',
    'mdi:gamepad-variant-outline',
    'mdi:garage',
    'mdi:gas-station-outline',
    'mdi:gift',
    'mdi:gift-open-outline',
    'mdi:gift-outline',
    'mdi:glass-mug-variant',
    'mdi:glass-wine',
    'mdi:glasses',
    'mdi:graduation-cap',
    'mdi:hamburger',
    'mdi:hand-coin',
    'mdi:hand-coin-outline',
    'mdi:hand-heart',
    'mdi:hand-heart-outline',
    'mdi:hand-wash-outline',
    'mdi:hanger',
    'mdi:hat-fedora',
    'mdi:headphones',
    'mdi:headset',
    'mdi:heart-outline',
    'mdi:heart-pulse',
    'mdi:hiking',
    'mdi:home-city-outline',
    'mdi:home-currency-usd',
    'mdi:home-group',
    'mdi:home-modern',
    'mdi:home-outline',
    'mdi:hospital-box-outline',
    'mdi:human-greeting',
    'mdi:ice-cream',
    'mdi:image-filter-hdr',
    'mdi:image-outline',
    'mdi:information-outline',
    'mdi:iron-outline',
    'mdi:karate',
    'mdi:key-outline',
    'mdi:keyboard-outline',
    'mdi:lamp-outline',
    'mdi:laptop',
    'mdi:leaf',
    'mdi:lightbulb-on-outline',
    'mdi:lightbulb-outline',
    'mdi:lightning-bolt-outline',
    'mdi:lipstick',
    'mdi:magic-staff',
    'mdi:magnify',
    'mdi:map-legend',
    'mdi:map-marker-outline',
    'mdi:map-outline',
    'mdi:marker',
    'mdi:medical-bag',
    'mdi:meditation',
    'mdi:microphone-outline',
    'mdi:microwave',
    'mdi:minus',
    'mdi:mirror',
    'mdi:monitor',
    'mdi:monitor-share',
    'mdi:motorcycle',
    'mdi:mouse',
    'mdi:movie-open-outline',
    'mdi:mushroom',
    'mdi:music-note',
    'mdi:music-note-eighth',
    'mdi:needle',
    'mdi:noodles',
    'mdi:notebook-outline',
    'mdi:package-variant-closed',
    'mdi:palette-outline',
    'mdi:palm-tree',
    'mdi:paper-roll-outline',
    'mdi:paper-towels-outline',
    'mdi:paperclip',
    'mdi:parking',
    'mdi:party-popper',
    'mdi:passport',
    'mdi:paw',
    'mdi:paw-outline',
    'mdi:payment',
    'mdi:pen',
    'mdi:pencil-outline',
    'mdi:percent-outline',
    'mdi:phone-classic',
    'mdi:phone-outline',
    'mdi:piggy-bank-outline',
    'mdi:pill',
    'mdi:pizza',
    'mdi:plus',
    'mdi:plus-circle-outline',
    'mdi:poker-chip',
    'mdi:pool',
    'mdi:popcorn',
    'mdi:postage-stamp',
    'mdi:pot-steam',
    'mdi:power-plug-outline',
    'mdi:printer',
    'mdi:printer-outline',
    'mdi:projector',
    'mdi:puzzle-outline',
    'mdi:qrcode',
    'mdi:qrcode-scan',
    'mdi:rabbit',
    'mdi:receipt-text-outline',
    'mdi:rectangle-outline',
    'mdi:refresh',
    'mdi:rice',
    'mdi:ring',
    'mdi:road-variant',
    'mdi:robot-outline',
    'mdi:rocket-launch-outline',
    'mdi:router-wireless',
    'mdi:run',
    'mdi:run-fast',
    'mdi:safe-square-outline',
    'mdi:sail-boat',
    'mdi:sale-outline',
    'mdi:school-outline',
    'mdi:screwdriver',
    'mdi:shape-outline',
    'mdi:shield-outline',
    'mdi:shoe-heel',
    'mdi:shoe-sneaker',
    'mdi:shopping-outline',
    'mdi:shower-head',
    'mdi:silverware-fork-knife',
    'mdi:skateboard',
    'mdi:ski',
    'mdi:snowflake',
    'mdi:soccer',
    'mdi:sofa-outline',
    'mdi:sofa-single-outline',
    'mdi:speaker',
    'mdi:speedometer',
    'mdi:spray-bottle',
    'mdi:square-outline',
    'mdi:star-four-points-outline',
    'mdi:star-outline',
    'mdi:stethoscope',
    'mdi:storefront-outline',
    'mdi:stove',
    'mdi:subway-variant',
    'mdi:sunglasses',
    'mdi:swim',
    'mdi:syringe',
    'mdi:table-furniture',
    'mdi:tablet',
    'mdi:tag-heart-outline',
    'mdi:tag-outline',
    'mdi:taxi',
    'mdi:tea',
    'mdi:telescope',
    'mdi:television-classic',
    'mdi:tennis',
    'mdi:tent',
    'mdi:thermometer',
    'mdi:ticket-outline',
    'mdi:ticket-percent',
    'mdi:tie',
    'mdi:toilet-paper-outline',
    'mdi:tooth-outline',
    'mdi:toothbrush',
    'mdi:traffic-light',
    'mdi:train',
    'mdi:train-car',
    'mdi:tram',
    'mdi:translate',
    'mdi:trash-can-outline',
    'mdi:tree-outline',
    'mdi:trending-down',
    'mdi:trending-up',
    'mdi:trophy-outline',
    'mdi:tshirt-crew-outline',
    'mdi:tshirt-v-outline',
    'mdi:umbrella-outline',
    'mdi:usb-flash-drive-outline',
    'mdi:vacuum-outline',
    'mdi:virtual-reality',
    'mdi:volleyball',
    'mdi:walk',
    'mdi:wallet',
    'mdi:wallet-giftcard',
    'mdi:wallet-outline',
    'mdi:wallet-travel',
    'mdi:washing-machine',
    'mdi:watch',
    'mdi:watch-variant',
    'mdi:water',
    'mdi:water-outline',
    'mdi:weather-night',
    'mdi:weather-sunny',
    'mdi:wechat',
    'mdi:weight-lifter',
    'mdi:wheelchair-accessibility',
    'mdi:whiteboard',
    'mdi:window-closed-variant',
    'mdi:wrench-outline',
    'mdi:yoga',
];

export interface IconCatalogEntry {
    readonly name: IconName;
    /** 选择器里的中文分组。 */
    readonly group: string;
    /** 搜索用的中文别名。 */
    readonly aliases: readonly string[];
}

/** 工程 UI 图标：语义名 → Iconify name。 */
export const UI_ICONS = {
    bills: 'mdi:receipt-text-outline',
    details: 'mdi:format-list-bulleted',
    calendar: 'mdi:calendar-month-outline',
    add: 'mdi:plus-circle-outline',
    assets: 'mdi:wallet-outline',
    settings: 'mdi:cog-outline',
    chevronLeft: 'mdi:chevron-left',
    chevronRight: 'mdi:chevron-right',
    chevronDown: 'mdi:chevron-down',
    chevronUp: 'mdi:chevron-up',
    arrowRight: 'mdi:arrow-right',
    check: 'mdi:check',
    close: 'mdi:close',
    plus: 'mdi:plus',
    minus: 'mdi:minus',
    dot: 'mdi:circle',
    backspace: 'mdi:backspace-outline',
    calendarToday: 'mdi:calendar-today',
    clock: 'mdi:clock-outline',
    edit: 'mdi:pencil-outline',
    trash: 'mdi:trash-can-outline',
    copy: 'mdi:content-copy',
    search: 'mdi:magnify',
    more: 'mdi:dots-horizontal',
    drag: 'mdi:drag-vertical',
    camera: 'mdi:camera-outline',
    image: 'mdi:image-outline',
    refresh: 'mdi:refresh',
    info: 'mdi:information-outline',
    success: 'mdi:check-circle-outline',
    warning: 'mdi:alert-outline',
    danger: 'mdi:alert-circle-outline',
    motionElegant: 'mdi:feather',
    motionStandard: 'mdi:auto-fix',
    motionRich: 'mdi:creation',
    radiusSquare: 'mdi:square-outline',
    radiusStandard: 'mdi:rectangle-outline',
    radiusRound: 'mdi:circle-outline',
} as const satisfies Record<string, IconName>;

/** 选择器分组顺序。 */
export const ICON_GROUPS: readonly string[] = [
    "支付与账户",
    "餐饮",
    "购物",
    "日用",
    "交通",
    "娱乐",
    "运动",
    "医疗",
    "学习",
    "办公",
    "数码",
    "人情",
    "金融",
    "宠物",
    "旅行",
    "穿戴",
    "住房",
    "其它",
];

/** 选择器候选图标。 */
export const ICON_CATALOG: readonly IconCatalogEntry[] = [
    { name: "mdi:bank", group: "支付与账户", aliases: ["银行"] },
    { name: "mdi:bank-outline", group: "支付与账户", aliases: ["银行","储蓄卡"] },
    { name: "mdi:bank-transfer", group: "支付与账户", aliases: ["转账","汇款"] },
    { name: "mdi:credit-card", group: "支付与账户", aliases: ["银行卡","信用卡"] },
    { name: "mdi:credit-card-outline", group: "支付与账户", aliases: ["银行卡","信用卡"] },
    { name: "mdi:credit-card-chip-outline", group: "支付与账户", aliases: ["芯片卡","储蓄卡"] },
    { name: "mdi:credit-card-multiple-outline", group: "支付与账户", aliases: ["多张卡","卡包"] },
    { name: "mdi:credit-card-wireless-outline", group: "支付与账户", aliases: ["闪付","云闪付"] },
    { name: "mdi:credit-card-scan-outline", group: "支付与账户", aliases: ["刷卡机","POS"] },
    { name: "mdi:credit-card-plus-outline", group: "支付与账户", aliases: [] },
    { name: "mdi:credit-card-clock-outline", group: "支付与账户", aliases: [] },
    { name: "mdi:wallet", group: "支付与账户", aliases: ["钱包"] },
    { name: "mdi:wallet-outline", group: "支付与账户", aliases: ["钱包","零钱","余额"] },
    { name: "mdi:wallet-giftcard", group: "支付与账户", aliases: ["储值卡","礼品卡"] },
    { name: "mdi:wallet-travel", group: "支付与账户", aliases: ["交通卡","旅行金"] },
    { name: "mdi:cash", group: "支付与账户", aliases: ["现金"] },
    { name: "mdi:cash-multiple", group: "支付与账户", aliases: ["现金","备用金"] },
    { name: "mdi:cash-fast", group: "支付与账户", aliases: ["快钱","零钱"] },
    { name: "mdi:cash-register", group: "支付与账户", aliases: ["收银","收款"] },
    { name: "mdi:coins-outline", group: "支付与账户", aliases: ["硬币","零钱"] },
    { name: "mdi:piggy-bank-outline", group: "支付与账户", aliases: ["存钱罐","储蓄"] },
    { name: "mdi:safe-square-outline", group: "支付与账户", aliases: ["保险箱","存款"] },
    { name: "mdi:qrcode-scan", group: "支付与账户", aliases: ["支付宝","扫码支付","二维码","收款码"] },
    { name: "mdi:contactless-payment", group: "支付与账户", aliases: ["闪付","NFC","云闪付"] },
    { name: "mdi:account-payment-outline", group: "支付与账户", aliases: ["支付","付款","网银"] },
    { name: "mdi:payment", group: "支付与账户", aliases: ["支付","付款"] },
    { name: "mdi:cellphone", group: "支付与账户", aliases: ["手机","手机银行"] },
    { name: "mdi:wechat", group: "支付与账户", aliases: ["微信","微信支付"] },
    { name: "mdi:currency-cny", group: "支付与账户", aliases: ["人民币","钱"] },
    { name: "mdi:hand-coin-outline", group: "支付与账户", aliases: ["借出","外借"] },
    { name: "mdi:cash-refund", group: "支付与账户", aliases: ["还款","退款"] },
    { name: "mdi:receipt-text-outline", group: "支付与账户", aliases: ["账单","票据"] },
    { name: "mdi:percent-outline", group: "支付与账户", aliases: ["利率","手续费"] },
    { name: "mdi:chart-line", group: "支付与账户", aliases: ["收益","理财"] },
    { name: "mdi:storefront-outline", group: "支付与账户", aliases: ["商户","店铺"] },
    { name: "mdi:noodles", group: "餐饮", aliases: ["面","饭"] },
    { name: "mdi:rice", group: "餐饮", aliases: [] },
    { name: "mdi:food-apple", group: "餐饮", aliases: [] },
    { name: "mdi:food-croissant", group: "餐饮", aliases: [] },
    { name: "mdi:pizza", group: "餐饮", aliases: [] },
    { name: "mdi:hamburger", group: "餐饮", aliases: [] },
    { name: "mdi:french-fries", group: "餐饮", aliases: [] },
    { name: "mdi:ice-cream", group: "餐饮", aliases: [] },
    { name: "mdi:cupcake", group: "餐饮", aliases: [] },
    { name: "mdi:cake-variant", group: "餐饮", aliases: [] },
    { name: "mdi:cookie", group: "餐饮", aliases: [] },
    { name: "mdi:candy", group: "餐饮", aliases: [] },
    { name: "mdi:coffee", group: "餐饮", aliases: ["咖啡"] },
    { name: "mdi:tea", group: "餐饮", aliases: [] },
    { name: "mdi:cup", group: "餐饮", aliases: [] },
    { name: "mdi:glass-mug-variant", group: "餐饮", aliases: [] },
    { name: "mdi:glass-wine", group: "餐饮", aliases: ["酒"] },
    { name: "mdi:beer", group: "餐饮", aliases: ["啤酒"] },
    { name: "mdi:bottle-soda", group: "餐饮", aliases: [] },
    { name: "mdi:bottle-wine", group: "餐饮", aliases: [] },
    { name: "mdi:silverware-fork-knife", group: "餐饮", aliases: [] },
    { name: "mdi:pot-steam", group: "餐饮", aliases: [] },
    { name: "mdi:chef-hat", group: "餐饮", aliases: [] },
    { name: "mdi:popcorn", group: "餐饮", aliases: [] },
    { name: "mdi:food-drumstick", group: "餐饮", aliases: [] },
    { name: "mdi:chili-hot", group: "餐饮", aliases: [] },
    { name: "mdi:corn", group: "餐饮", aliases: [] },
    { name: "mdi:carrot", group: "餐饮", aliases: [] },
    { name: "mdi:mushroom", group: "餐饮", aliases: [] },
    { name: "mdi:bread-slice", group: "餐饮", aliases: [] },
    { name: "mdi:cart-outline", group: "购物", aliases: ["购物车","买东西"] },
    { name: "mdi:cart-variant", group: "购物", aliases: [] },
    { name: "mdi:basket-outline", group: "购物", aliases: [] },
    { name: "mdi:shopping-outline", group: "购物", aliases: [] },
    { name: "mdi:tag-outline", group: "购物", aliases: [] },
    { name: "mdi:tag-heart-outline", group: "购物", aliases: [] },
    { name: "mdi:sale-outline", group: "购物", aliases: [] },
    { name: "mdi:gift-outline", group: "购物", aliases: ["礼物"] },
    { name: "mdi:gift-open-outline", group: "购物", aliases: [] },
    { name: "mdi:package-variant-closed", group: "购物", aliases: [] },
    { name: "mdi:barcode", group: "购物", aliases: [] },
    { name: "mdi:qrcode", group: "购物", aliases: [] },
    { name: "mdi:paper-roll-outline", group: "日用", aliases: ["纸巾","卫生纸"] },
    { name: "mdi:toothbrush", group: "日用", aliases: [] },
    { name: "mdi:hand-wash-outline", group: "日用", aliases: ["香皂","沐浴露","洗手液"] },
    { name: "mdi:spray-bottle", group: "日用", aliases: [] },
    { name: "mdi:broom", group: "日用", aliases: [] },
    { name: "mdi:washing-machine", group: "日用", aliases: [] },
    { name: "mdi:vacuum-outline", group: "日用", aliases: [] },
    { name: "mdi:paper-towels-outline", group: "日用", aliases: [] },
    { name: "mdi:bucket-outline", group: "日用", aliases: [] },
    { name: "mdi:lamp-outline", group: "日用", aliases: [] },
    { name: "mdi:lightbulb-outline", group: "日用", aliases: [] },
    { name: "mdi:power-plug-outline", group: "日用", aliases: [] },
    { name: "mdi:water-outline", group: "日用", aliases: [] },
    { name: "mdi:trash-can-outline", group: "日用", aliases: [] },
    { name: "mdi:toilet-paper-outline", group: "日用", aliases: [] },
    { name: "mdi:iron-outline", group: "日用", aliases: [] },
    { name: "mdi:hanger", group: "日用", aliases: [] },
    { name: "mdi:mirror", group: "日用", aliases: [] },
    { name: "mdi:stove", group: "日用", aliases: [] },
    { name: "mdi:microwave", group: "日用", aliases: [] },
    { name: "mdi:fridge-outline", group: "日用", aliases: [] },
    { name: "mdi:shower-head", group: "日用", aliases: [] },
    { name: "mdi:bus", group: "交通", aliases: ["公交车"] },
    { name: "mdi:car", group: "交通", aliases: ["汽车","打车"] },
    { name: "mdi:taxi", group: "交通", aliases: [] },
    { name: "mdi:train", group: "交通", aliases: ["火车","高铁"] },
    { name: "mdi:subway-variant", group: "交通", aliases: [] },
    { name: "mdi:tram", group: "交通", aliases: [] },
    { name: "mdi:airplane", group: "交通", aliases: ["飞机"] },
    { name: "mdi:bike", group: "交通", aliases: [] },
    { name: "mdi:motorcycle", group: "交通", aliases: [] },
    { name: "mdi:gas-station-outline", group: "交通", aliases: [] },
    { name: "mdi:map-marker-outline", group: "交通", aliases: [] },
    { name: "mdi:road-variant", group: "交通", aliases: [] },
    { name: "mdi:ferry", group: "交通", aliases: [] },
    { name: "mdi:walk", group: "交通", aliases: [] },
    { name: "mdi:parking", group: "交通", aliases: [] },
    { name: "mdi:ev-station", group: "交通", aliases: [] },
    { name: "mdi:car-wash", group: "交通", aliases: [] },
    { name: "mdi:traffic-light", group: "交通", aliases: [] },
    { name: "mdi:speedometer", group: "交通", aliases: [] },
    { name: "mdi:train-car", group: "交通", aliases: [] },
    { name: "mdi:gamepad-variant-outline", group: "娱乐", aliases: ["游戏","打游戏"] },
    { name: "mdi:controller-classic-outline", group: "娱乐", aliases: [] },
    { name: "mdi:movie-open-outline", group: "娱乐", aliases: ["电影"] },
    { name: "mdi:music-note", group: "娱乐", aliases: ["音乐"] },
    { name: "mdi:music-note-eighth", group: "娱乐", aliases: [] },
    { name: "mdi:headphones", group: "娱乐", aliases: [] },
    { name: "mdi:ticket-outline", group: "娱乐", aliases: [] },
    { name: "mdi:ticket-percent", group: "娱乐", aliases: [] },
    { name: "mdi:dice-multiple-outline", group: "娱乐", aliases: [] },
    { name: "mdi:cards-playing-outline", group: "娱乐", aliases: [] },
    { name: "mdi:microphone-outline", group: "娱乐", aliases: [] },
    { name: "mdi:television-classic", group: "娱乐", aliases: [] },
    { name: "mdi:party-popper", group: "娱乐", aliases: [] },
    { name: "mdi:balloon", group: "娱乐", aliases: [] },
    { name: "mdi:ferris-wheel", group: "娱乐", aliases: [] },
    { name: "mdi:poker-chip", group: "娱乐", aliases: [] },
    { name: "mdi:chess-knight", group: "娱乐", aliases: [] },
    { name: "mdi:puzzle-outline", group: "娱乐", aliases: [] },
    { name: "mdi:run", group: "运动", aliases: ["跑步","运动"] },
    { name: "mdi:run-fast", group: "运动", aliases: [] },
    { name: "mdi:basketball", group: "运动", aliases: [] },
    { name: "mdi:soccer", group: "运动", aliases: [] },
    { name: "mdi:tennis", group: "运动", aliases: [] },
    { name: "mdi:badminton", group: "运动", aliases: [] },
    { name: "mdi:volleyball", group: "运动", aliases: [] },
    { name: "mdi:swim", group: "运动", aliases: ["游泳"] },
    { name: "mdi:yoga", group: "运动", aliases: ["瑜伽"] },
    { name: "mdi:dumbbell", group: "运动", aliases: [] },
    { name: "mdi:weight-lifter", group: "运动", aliases: [] },
    { name: "mdi:hiking", group: "运动", aliases: [] },
    { name: "mdi:ski", group: "运动", aliases: [] },
    { name: "mdi:skateboard", group: "运动", aliases: [] },
    { name: "mdi:karate", group: "运动", aliases: [] },
    { name: "mdi:boxing-glove", group: "运动", aliases: [] },
    { name: "mdi:meditation", group: "运动", aliases: [] },
    { name: "mdi:medical-bag", group: "医疗", aliases: ["看病","医院"] },
    { name: "mdi:hospital-box-outline", group: "医疗", aliases: [] },
    { name: "mdi:pill", group: "医疗", aliases: ["买药","药"] },
    { name: "mdi:thermometer", group: "医疗", aliases: [] },
    { name: "mdi:stethoscope", group: "医疗", aliases: [] },
    { name: "mdi:bandage", group: "医疗", aliases: [] },
    { name: "mdi:needle", group: "医疗", aliases: [] },
    { name: "mdi:heart-pulse", group: "医疗", aliases: [] },
    { name: "mdi:syringe", group: "医疗", aliases: [] },
    { name: "mdi:tooth-outline", group: "医疗", aliases: [] },
    { name: "mdi:account-injury-outline", group: "医疗", aliases: [] },
    { name: "mdi:wheelchair-accessibility", group: "医疗", aliases: [] },
    { name: "mdi:book-open-page-variant-outline", group: "学习", aliases: ["书","看书"] },
    { name: "mdi:book-open-variant", group: "学习", aliases: [] },
    { name: "mdi:book-outline", group: "学习", aliases: [] },
    { name: "mdi:school-outline", group: "学习", aliases: ["上学","学费"] },
    { name: "mdi:pencil-outline", group: "学习", aliases: [] },
    { name: "mdi:notebook-outline", group: "学习", aliases: [] },
    { name: "mdi:calculator-variant-outline", group: "学习", aliases: [] },
    { name: "mdi:certificate-outline", group: "学习", aliases: [] },
    { name: "mdi:brain", group: "学习", aliases: [] },
    { name: "mdi:lightbulb-on-outline", group: "学习", aliases: [] },
    { name: "mdi:translate", group: "学习", aliases: [] },
    { name: "mdi:graduation-cap", group: "学习", aliases: [] },
    { name: "mdi:briefcase-outline", group: "办公", aliases: ["办公","工作"] },
    { name: "mdi:desk", group: "办公", aliases: [] },
    { name: "mdi:printer-outline", group: "办公", aliases: [] },
    { name: "mdi:file-document-outline", group: "办公", aliases: [] },
    { name: "mdi:folder-outline", group: "办公", aliases: [] },
    { name: "mdi:email-outline", group: "办公", aliases: [] },
    { name: "mdi:phone-outline", group: "办公", aliases: [] },
    { name: "mdi:calendar-check-outline", group: "办公", aliases: [] },
    { name: "mdi:clipboard-text-outline", group: "办公", aliases: [] },
    { name: "mdi:paperclip", group: "办公", aliases: [] },
    { name: "mdi:postage-stamp", group: "办公", aliases: [] },
    { name: "mdi:pen", group: "办公", aliases: [] },
    { name: "mdi:marker", group: "办公", aliases: [] },
    { name: "mdi:whiteboard", group: "办公", aliases: [] },
    { name: "mdi:projector", group: "办公", aliases: [] },
    { name: "mdi:monitor-share", group: "办公", aliases: [] },
    { name: "mdi:laptop", group: "数码", aliases: ["电脑"] },
    { name: "mdi:tablet", group: "数码", aliases: [] },
    { name: "mdi:watch-variant", group: "数码", aliases: [] },
    { name: "mdi:camera-outline", group: "数码", aliases: [] },
    { name: "mdi:headset", group: "数码", aliases: ["耳机"] },
    { name: "mdi:router-wireless", group: "数码", aliases: [] },
    { name: "mdi:usb-flash-drive-outline", group: "数码", aliases: [] },
    { name: "mdi:monitor", group: "数码", aliases: [] },
    { name: "mdi:keyboard-outline", group: "数码", aliases: [] },
    { name: "mdi:mouse", group: "数码", aliases: [] },
    { name: "mdi:speaker", group: "数码", aliases: [] },
    { name: "mdi:drone", group: "数码", aliases: [] },
    { name: "mdi:virtual-reality", group: "数码", aliases: [] },
    { name: "mdi:account-group-outline", group: "人情", aliases: ["聚会","社交"] },
    { name: "mdi:account-multiple-outline", group: "人情", aliases: [] },
    { name: "mdi:hand-heart-outline", group: "人情", aliases: [] },
    { name: "mdi:hand-heart", group: "人情", aliases: ["捐赠","爱心"] },
    { name: "mdi:gift", group: "人情", aliases: [] },
    { name: "mdi:cake-variant-outline", group: "人情", aliases: ["生日","蛋糕"] },
    { name: "mdi:heart-outline", group: "人情", aliases: [] },
    { name: "mdi:ring", group: "人情", aliases: [] },
    { name: "mdi:human-greeting", group: "人情", aliases: [] },
    { name: "mdi:emoji-happy-outline", group: "人情", aliases: [] },
    { name: "mdi:account-heart-outline", group: "人情", aliases: [] },
    { name: "mdi:account-supervisor-outline", group: "人情", aliases: [] },
    { name: "mdi:phone-classic", group: "人情", aliases: [] },
    { name: "mdi:finance", group: "金融", aliases: ["理财","基金"] },
    { name: "mdi:chart-donut", group: "金融", aliases: [] },
    { name: "mdi:chart-pie", group: "金融", aliases: [] },
    { name: "mdi:trending-up", group: "金融", aliases: [] },
    { name: "mdi:trending-down", group: "金融", aliases: [] },
    { name: "mdi:hand-coin", group: "金融", aliases: [] },
    { name: "mdi:currency-usd", group: "金融", aliases: [] },
    { name: "mdi:chart-box-outline", group: "金融", aliases: [] },
    { name: "mdi:home-currency-usd", group: "金融", aliases: [] },
    { name: "mdi:paw", group: "宠物", aliases: ["宠物","猫狗"] },
    { name: "mdi:paw-outline", group: "宠物", aliases: [] },
    { name: "mdi:dog", group: "宠物", aliases: ["狗"] },
    { name: "mdi:dog-side", group: "宠物", aliases: [] },
    { name: "mdi:cat", group: "宠物", aliases: ["猫"] },
    { name: "mdi:bird", group: "宠物", aliases: [] },
    { name: "mdi:fish", group: "宠物", aliases: [] },
    { name: "mdi:rabbit", group: "宠物", aliases: [] },
    { name: "mdi:bone", group: "宠物", aliases: [] },
    { name: "mdi:bag-suitcase-outline", group: "旅行", aliases: ["旅行","行李"] },
    { name: "mdi:bag-suitcase", group: "旅行", aliases: [] },
    { name: "mdi:earth", group: "旅行", aliases: ["地球","出国"] },
    { name: "mdi:map-outline", group: "旅行", aliases: [] },
    { name: "mdi:map-legend", group: "旅行", aliases: [] },
    { name: "mdi:passport", group: "旅行", aliases: [] },
    { name: "mdi:beach", group: "旅行", aliases: [] },
    { name: "mdi:tent", group: "旅行", aliases: ["露营"] },
    { name: "mdi:compass-outline", group: "旅行", aliases: [] },
    { name: "mdi:image-filter-hdr", group: "旅行", aliases: [] },
    { name: "mdi:palm-tree", group: "旅行", aliases: [] },
    { name: "mdi:sail-boat", group: "旅行", aliases: [] },
    { name: "mdi:binoculars", group: "旅行", aliases: [] },
    { name: "mdi:tshirt-crew-outline", group: "穿戴", aliases: ["衣服","服装"] },
    { name: "mdi:tshirt-v-outline", group: "穿戴", aliases: [] },
    { name: "mdi:shoe-sneaker", group: "穿戴", aliases: ["鞋"] },
    { name: "mdi:shoe-heel", group: "穿戴", aliases: [] },
    { name: "mdi:hat-fedora", group: "穿戴", aliases: [] },
    { name: "mdi:sunglasses", group: "穿戴", aliases: [] },
    { name: "mdi:glasses", group: "穿戴", aliases: [] },
    { name: "mdi:watch", group: "穿戴", aliases: [] },
    { name: "mdi:lipstick", group: "穿戴", aliases: ["化妆品","口红"] },
    { name: "mdi:face-woman-shimmer", group: "穿戴", aliases: [] },
    { name: "mdi:face-man-shimmer", group: "穿戴", aliases: [] },
    { name: "mdi:tie", group: "穿戴", aliases: [] },
    { name: "mdi:home-outline", group: "住房", aliases: ["房子","家"] },
    { name: "mdi:home-city-outline", group: "住房", aliases: [] },
    { name: "mdi:home-group", group: "住房", aliases: [] },
    { name: "mdi:home-modern", group: "住房", aliases: [] },
    { name: "mdi:bed-outline", group: "住房", aliases: ["床","住宿"] },
    { name: "mdi:bed-king-outline", group: "住房", aliases: [] },
    { name: "mdi:sofa-outline", group: "住房", aliases: [] },
    { name: "mdi:sofa-single-outline", group: "住房", aliases: [] },
    { name: "mdi:table-furniture", group: "住房", aliases: [] },
    { name: "mdi:chair-outline", group: "住房", aliases: [] },
    { name: "mdi:door", group: "住房", aliases: [] },
    { name: "mdi:window-closed-variant", group: "住房", aliases: [] },
    { name: "mdi:key-outline", group: "住房", aliases: ["钥匙","房租"] },
    { name: "mdi:garage", group: "住房", aliases: [] },
    { name: "mdi:fence", group: "住房", aliases: [] },
    { name: "mdi:tree-outline", group: "住房", aliases: [] },
    { name: "mdi:flower-outline", group: "住房", aliases: [] },
    { name: "mdi:pool", group: "住房", aliases: [] },
    { name: "mdi:star-outline", group: "其它", aliases: ["追星","星星"] },
    { name: "mdi:star-four-points-outline", group: "其它", aliases: [] },
    { name: "mdi:lightning-bolt-outline", group: "其它", aliases: [] },
    { name: "mdi:fire", group: "其它", aliases: ["火"] },
    { name: "mdi:water", group: "其它", aliases: [] },
    { name: "mdi:leaf", group: "其它", aliases: ["叶子","植物"] },
    { name: "mdi:flower", group: "其它", aliases: [] },
    { name: "mdi:umbrella-outline", group: "其它", aliases: [] },
    { name: "mdi:brush", group: "其它", aliases: [] },
    { name: "mdi:palette-outline", group: "其它", aliases: [] },
    { name: "mdi:magic-staff", group: "其它", aliases: [] },
    { name: "mdi:robot-outline", group: "其它", aliases: [] },
    { name: "mdi:alarm", group: "其它", aliases: [] },
    { name: "mdi:bell-outline", group: "其它", aliases: [] },
    { name: "mdi:clock-outline", group: "其它", aliases: ["时间"] },
    { name: "mdi:dots-horizontal-circle-outline", group: "其它", aliases: [] },
    { name: "mdi:shape-outline", group: "其它", aliases: [] },
    { name: "mdi:wrench-outline", group: "其它", aliases: [] },
    { name: "mdi:screwdriver", group: "其它", aliases: [] },
    { name: "mdi:flashlight", group: "其它", aliases: [] },
    { name: "mdi:rocket-launch-outline", group: "其它", aliases: [] },
    { name: "mdi:shield-outline", group: "其它", aliases: [] },
    { name: "mdi:crown-outline", group: "其它", aliases: [] },
    { name: "mdi:diamond-stone", group: "其它", aliases: [] },
    { name: "mdi:weather-sunny", group: "其它", aliases: [] },
    { name: "mdi:weather-night", group: "其它", aliases: [] },
    { name: "mdi:snowflake", group: "其它", aliases: [] },
    { name: "mdi:atom", group: "其它", aliases: [] },
    { name: "mdi:flask-outline", group: "其它", aliases: [] },
    { name: "mdi:telescope", group: "其它", aliases: [] },
    { name: "mdi:trophy-outline", group: "其它", aliases: [] },
];

/** 内置分类条目（顺序即宫格顺序）。 */
export interface DefaultCategory {
    /** 稳定主键：种子数据落库后不得改名。 */
    readonly id: string;
    readonly kind: 'expense' | 'income';
    readonly name: string;
    readonly iconName: IconName;
}

/** 内置分类（与 Rust 侧 crates/tk-ledger/src/seed_categories.generated.rs 同源）。 */
export const DEFAULT_CATEGORIES: {
    readonly expense: readonly DefaultCategory[];
    readonly income: readonly DefaultCategory[];
} = {
    expense: [
        { id: "food", kind: 'expense', name: "餐饮", iconName: 'mdi:noodles' },
        { id: "shopping", kind: 'expense', name: "购物", iconName: 'mdi:cart-outline' },
        { id: "daily", kind: 'expense', name: "日用", iconName: 'mdi:paper-roll-outline' },
        { id: "transport", kind: 'expense', name: "交通", iconName: 'mdi:bus' },
        { id: "vegetable", kind: 'expense', name: "蔬菜", iconName: 'mdi:carrot' },
        { id: "fruit", kind: 'expense', name: "水果", iconName: 'mdi:food-apple' },
        { id: "snack", kind: 'expense', name: "零食", iconName: 'mdi:candy' },
        { id: "sport", kind: 'expense', name: "运动", iconName: 'mdi:run' },
        { id: "entertainment", kind: 'expense', name: "娱乐", iconName: 'mdi:gamepad-variant-outline' },
        { id: "telecom", kind: 'expense', name: "通讯", iconName: 'mdi:phone-outline' },
        { id: "clothing", kind: 'expense', name: "服饰", iconName: 'mdi:tshirt-crew-outline' },
        { id: "beauty", kind: 'expense', name: "美容", iconName: 'mdi:lipstick' },
        { id: "housing", kind: 'expense', name: "住房", iconName: 'mdi:home-city-outline' },
        { id: "family", kind: 'expense', name: "家庭", iconName: 'mdi:sofa-outline' },
        { id: "social", kind: 'expense', name: "社交", iconName: 'mdi:account-group-outline' },
        { id: "travel", kind: 'expense', name: "旅行", iconName: 'mdi:bag-suitcase-outline' },
        { id: "tobacco_alcohol", kind: 'expense', name: "烟酒", iconName: 'mdi:glass-wine' },
        { id: "digital", kind: 'expense', name: "数码", iconName: 'mdi:laptop' },
        { id: "car", kind: 'expense', name: "汽车", iconName: 'mdi:car' },
        { id: "medical", kind: 'expense', name: "医疗", iconName: 'mdi:medical-bag' },
        { id: "books", kind: 'expense', name: "书籍", iconName: 'mdi:book-open-page-variant-outline' },
        { id: "study", kind: 'expense', name: "学习", iconName: 'mdi:school-outline' },
        { id: "pet", kind: 'expense', name: "宠物", iconName: 'mdi:paw' },
        { id: "gift_money", kind: 'expense', name: "礼金", iconName: 'mdi:cash-multiple' },
        { id: "gift", kind: 'expense', name: "礼品", iconName: 'mdi:gift-outline' },
        { id: "office", kind: 'expense', name: "办公", iconName: 'mdi:briefcase-outline' },
        { id: "repair", kind: 'expense', name: "维修", iconName: 'mdi:wrench-outline' },
        { id: "donate", kind: 'expense', name: "捐赠", iconName: 'mdi:hand-heart-outline' },
        { id: "lottery", kind: 'expense', name: "彩票", iconName: 'mdi:ticket-percent' },
        { id: "red_packet", kind: 'expense', name: "红包", iconName: 'mdi:gift-open-outline' },
        { id: "express", kind: 'expense', name: "快递", iconName: 'mdi:package-variant-closed' },
        { id: "other", kind: 'expense', name: "其它", iconName: 'mdi:dots-horizontal-circle-outline' },
        { id: "repay", kind: 'expense', name: "还款", iconName: 'mdi:cash-refund' },
        { id: "lend_out", kind: 'expense', name: "借出", iconName: 'mdi:hand-coin-outline' },
        { id: "drink", kind: 'expense', name: "饮品", iconName: 'mdi:coffee' },
        { id: "fandom", kind: 'expense', name: "追星", iconName: 'mdi:star-outline' },
        { id: "game", kind: 'expense', name: "游戏", iconName: 'mdi:controller-classic-outline' },
    ],
    income: [
        { id: "salary", kind: 'income', name: "工资", iconName: 'mdi:wallet-outline' },
        { id: "red_packet", kind: 'income', name: "红包", iconName: 'mdi:gift-open-outline' },
        { id: "rent", kind: 'income', name: "租金", iconName: 'mdi:home-currency-usd' },
        { id: "gift_money", kind: 'income', name: "礼金", iconName: 'mdi:cash-multiple' },
        { id: "dividend", kind: 'income', name: "分红", iconName: 'mdi:chart-donut' },
        { id: "invest", kind: 'income', name: "理财", iconName: 'mdi:finance' },
        { id: "bonus", kind: 'income', name: "年终奖", iconName: 'mdi:trophy-outline' },
        { id: "other", kind: 'income', name: "其它", iconName: 'mdi:dots-horizontal-circle-outline' },
        { id: "borrow_in", kind: 'income', name: "借入", iconName: 'mdi:hand-coin-outline' },
        { id: "repay", kind: 'income', name: "还款", iconName: 'mdi:cash-refund' },
    ],
};

/** 兼容视图：分类名 → 完整图标名。 */
export const DEFAULT_CATEGORY_ICONS: {
    readonly expense: Readonly<Record<string, IconName>>;
    readonly income: Readonly<Record<string, IconName>>;
} = {
    expense: {
        "餐饮": 'mdi:noodles',
        "购物": 'mdi:cart-outline',
        "日用": 'mdi:paper-roll-outline',
        "交通": 'mdi:bus',
        "蔬菜": 'mdi:carrot',
        "水果": 'mdi:food-apple',
        "零食": 'mdi:candy',
        "运动": 'mdi:run',
        "娱乐": 'mdi:gamepad-variant-outline',
        "通讯": 'mdi:phone-outline',
        "服饰": 'mdi:tshirt-crew-outline',
        "美容": 'mdi:lipstick',
        "住房": 'mdi:home-city-outline',
        "家庭": 'mdi:sofa-outline',
        "社交": 'mdi:account-group-outline',
        "旅行": 'mdi:bag-suitcase-outline',
        "烟酒": 'mdi:glass-wine',
        "数码": 'mdi:laptop',
        "汽车": 'mdi:car',
        "医疗": 'mdi:medical-bag',
        "书籍": 'mdi:book-open-page-variant-outline',
        "学习": 'mdi:school-outline',
        "宠物": 'mdi:paw',
        "礼金": 'mdi:cash-multiple',
        "礼品": 'mdi:gift-outline',
        "办公": 'mdi:briefcase-outline',
        "维修": 'mdi:wrench-outline',
        "捐赠": 'mdi:hand-heart-outline',
        "彩票": 'mdi:ticket-percent',
        "红包": 'mdi:gift-open-outline',
        "快递": 'mdi:package-variant-closed',
        "其它": 'mdi:dots-horizontal-circle-outline',
        "还款": 'mdi:cash-refund',
        "借出": 'mdi:hand-coin-outline',
        "饮品": 'mdi:coffee',
        "追星": 'mdi:star-outline',
        "游戏": 'mdi:controller-classic-outline',
    },
    income: {
        "工资": 'mdi:wallet-outline',
        "红包": 'mdi:gift-open-outline',
        "租金": 'mdi:home-currency-usd',
        "礼金": 'mdi:cash-multiple',
        "分红": 'mdi:chart-donut',
        "理财": 'mdi:finance',
        "年终奖": 'mdi:trophy-outline',
        "其它": 'mdi:dots-horizontal-circle-outline',
        "借入": 'mdi:hand-coin-outline',
        "还款": 'mdi:cash-refund',
    },
};
