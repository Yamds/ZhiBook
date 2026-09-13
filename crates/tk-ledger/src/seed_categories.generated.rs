// 由 scripts/build-icon-subset.mjs 生成，请勿手改。
// 重新生成：pnpm run icons（目录在 scripts/icon-catalog.mjs）
//
// 内置分类种子数据：与前端 `DEFAULT_CATEGORIES` 同一份目录，
// id 为「{kind}_{目录 id}」，落库后必须保持稳定。

use crate::seed::SeedCategory;

/// 内置分类（支出 37 / 收入 10），顺序即宫格顺序。
pub const SEED_CATEGORIES: &[SeedCategory] = &[
    SeedCategory {
        id: "expense_food",
        kind: "expense",
        name: "餐饮",
        icon_name: "mdi:noodles",
    },
    SeedCategory {
        id: "expense_shopping",
        kind: "expense",
        name: "购物",
        icon_name: "mdi:cart-outline",
    },
    SeedCategory {
        id: "expense_daily",
        kind: "expense",
        name: "日用",
        icon_name: "mdi:paper-roll-outline",
    },
    SeedCategory {
        id: "expense_transport",
        kind: "expense",
        name: "交通",
        icon_name: "mdi:bus",
    },
    SeedCategory {
        id: "expense_vegetable",
        kind: "expense",
        name: "蔬菜",
        icon_name: "mdi:carrot",
    },
    SeedCategory {
        id: "expense_fruit",
        kind: "expense",
        name: "水果",
        icon_name: "mdi:food-apple",
    },
    SeedCategory {
        id: "expense_snack",
        kind: "expense",
        name: "零食",
        icon_name: "mdi:candy",
    },
    SeedCategory {
        id: "expense_sport",
        kind: "expense",
        name: "运动",
        icon_name: "mdi:run",
    },
    SeedCategory {
        id: "expense_entertainment",
        kind: "expense",
        name: "娱乐",
        icon_name: "mdi:gamepad-variant-outline",
    },
    SeedCategory {
        id: "expense_telecom",
        kind: "expense",
        name: "通讯",
        icon_name: "mdi:phone-outline",
    },
    SeedCategory {
        id: "expense_clothing",
        kind: "expense",
        name: "服饰",
        icon_name: "mdi:tshirt-crew-outline",
    },
    SeedCategory {
        id: "expense_beauty",
        kind: "expense",
        name: "美容",
        icon_name: "mdi:lipstick",
    },
    SeedCategory {
        id: "expense_housing",
        kind: "expense",
        name: "住房",
        icon_name: "mdi:home-city-outline",
    },
    SeedCategory {
        id: "expense_family",
        kind: "expense",
        name: "家庭",
        icon_name: "mdi:sofa-outline",
    },
    SeedCategory {
        id: "expense_social",
        kind: "expense",
        name: "社交",
        icon_name: "mdi:account-group-outline",
    },
    SeedCategory {
        id: "expense_travel",
        kind: "expense",
        name: "旅行",
        icon_name: "mdi:bag-suitcase-outline",
    },
    SeedCategory {
        id: "expense_tobacco_alcohol",
        kind: "expense",
        name: "烟酒",
        icon_name: "mdi:glass-wine",
    },
    SeedCategory {
        id: "expense_digital",
        kind: "expense",
        name: "数码",
        icon_name: "mdi:laptop",
    },
    SeedCategory {
        id: "expense_car",
        kind: "expense",
        name: "汽车",
        icon_name: "mdi:car",
    },
    SeedCategory {
        id: "expense_medical",
        kind: "expense",
        name: "医疗",
        icon_name: "mdi:medical-bag",
    },
    SeedCategory {
        id: "expense_books",
        kind: "expense",
        name: "书籍",
        icon_name: "mdi:book-open-page-variant-outline",
    },
    SeedCategory {
        id: "expense_study",
        kind: "expense",
        name: "学习",
        icon_name: "mdi:school-outline",
    },
    SeedCategory {
        id: "expense_pet",
        kind: "expense",
        name: "宠物",
        icon_name: "mdi:paw",
    },
    SeedCategory {
        id: "expense_gift_money",
        kind: "expense",
        name: "礼金",
        icon_name: "mdi:cash-multiple",
    },
    SeedCategory {
        id: "expense_gift",
        kind: "expense",
        name: "礼品",
        icon_name: "mdi:gift-outline",
    },
    SeedCategory {
        id: "expense_office",
        kind: "expense",
        name: "办公",
        icon_name: "mdi:briefcase-outline",
    },
    SeedCategory {
        id: "expense_repair",
        kind: "expense",
        name: "维修",
        icon_name: "mdi:wrench-outline",
    },
    SeedCategory {
        id: "expense_donate",
        kind: "expense",
        name: "捐赠",
        icon_name: "mdi:hand-heart-outline",
    },
    SeedCategory {
        id: "expense_lottery",
        kind: "expense",
        name: "彩票",
        icon_name: "mdi:ticket-percent",
    },
    SeedCategory {
        id: "expense_red_packet",
        kind: "expense",
        name: "红包",
        icon_name: "mdi:gift-open-outline",
    },
    SeedCategory {
        id: "expense_express",
        kind: "expense",
        name: "快递",
        icon_name: "mdi:package-variant-closed",
    },
    SeedCategory {
        id: "expense_other",
        kind: "expense",
        name: "其它",
        icon_name: "mdi:dots-horizontal-circle-outline",
    },
    SeedCategory {
        id: "expense_repay",
        kind: "expense",
        name: "还款",
        icon_name: "mdi:cash-refund",
    },
    SeedCategory {
        id: "expense_lend_out",
        kind: "expense",
        name: "借出",
        icon_name: "mdi:hand-coin-outline",
    },
    SeedCategory {
        id: "expense_drink",
        kind: "expense",
        name: "饮品",
        icon_name: "mdi:coffee",
    },
    SeedCategory {
        id: "expense_fandom",
        kind: "expense",
        name: "追星",
        icon_name: "mdi:star-outline",
    },
    SeedCategory {
        id: "expense_game",
        kind: "expense",
        name: "游戏",
        icon_name: "mdi:controller-classic-outline",
    },
    SeedCategory {
        id: "income_salary",
        kind: "income",
        name: "工资",
        icon_name: "mdi:wallet-outline",
    },
    SeedCategory {
        id: "income_red_packet",
        kind: "income",
        name: "红包",
        icon_name: "mdi:gift-open-outline",
    },
    SeedCategory {
        id: "income_rent",
        kind: "income",
        name: "租金",
        icon_name: "mdi:home-currency-usd",
    },
    SeedCategory {
        id: "income_gift_money",
        kind: "income",
        name: "礼金",
        icon_name: "mdi:cash-multiple",
    },
    SeedCategory {
        id: "income_dividend",
        kind: "income",
        name: "分红",
        icon_name: "mdi:chart-donut",
    },
    SeedCategory {
        id: "income_invest",
        kind: "income",
        name: "理财",
        icon_name: "mdi:finance",
    },
    SeedCategory {
        id: "income_bonus",
        kind: "income",
        name: "年终奖",
        icon_name: "mdi:trophy-outline",
    },
    SeedCategory {
        id: "income_other",
        kind: "income",
        name: "其它",
        icon_name: "mdi:dots-horizontal-circle-outline",
    },
    SeedCategory {
        id: "income_borrow_in",
        kind: "income",
        name: "借入",
        icon_name: "mdi:hand-coin-outline",
    },
    SeedCategory {
        id: "income_repay",
        kind: "income",
        name: "还款",
        icon_name: "mdi:cash-refund",
    },
];
