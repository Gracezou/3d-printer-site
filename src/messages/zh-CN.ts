export const zhCN = {
  brand: {
    name: '书衣',
    englishName: 'Bookskin',
    tagline: '为每一台阅读器做一件合身的壳',
    footerDescription:
      '书衣 · 电子阅读器保护壳。按单打印，冷门机型与停产老款也做。',
    heroTitle: '量卷裁衣',
    heroDescription:
      '为每一台电子阅读器，做一件合身的壳。新品到停产旧机，按单打印，一台也做。',
  },
  navigation: {
    home: '首页',
    allDevices: '全部机型',
    newest: '新开模',
    account: '我的账户',
    orders: '我的订单',
    profile: '个人资料',
    contact: '联系我们',
    explore: '探索',
  },
  actions: {
    viewAll: '查看全部',
    retry: '重新加载',
    chooseDevice: '选择我的设备',
  },
  orderStatus: {
    pending_payment: '待支付',
    paid: '已支付',
    in_production: '生产中',
    pending_shipment: '待发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款',
  },
  customerOrderStatus: {
    pending_payment: '待支付',
    paid: '已支付',
    in_production: '生产中',
    pending_shipment: '等待发货',
    shipped: '待收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款',
  },
  printStatus: {
    queued: '待排产',
    printing: '打印中',
    post_processing: '后处理中',
    done: '已完成',
    failed: '打印失败',
  },
  errors: {
    network: '网络异常，请稍后再试',
    requestFailed: '请求失败',
    temporary: '可能是网络短暂波动，请稍后重试。',
  },
  commerce: {
    deliveryShort: '7 天内发出',
    deliveryComplete: '7 天内完成',
    deliveryExpected: '下单后 7 个自然日内发出',
    deliveryFooter: '下单后排产打印、去支撑打磨并装机复核，7 个自然日内发出。',
    deliveryDelay:
      '订单集中时排产可能顺延，我们会在订单状态里同步进度，不会让你干等。',
    afterSales:
      '3D 打印作品可能存在轻微层纹，这是逐层成型工艺的正常特征。运输损坏或质量问题请在签收后及时联系我们。',
    shippingFee: '运费',
    freeShippingByCode: '优惠码已免除运费',
    freeShippingThreshold: (amount: string | null) =>
      amount ? `商品满 ¥${amount}，已包邮` : '商品已达到包邮门槛',
  },
  seo: {
    rootTitle: '书衣｜电子阅读器保护壳',
    rootDescription:
      '为每一台阅读器做一件合身的壳。按单打印，冷门机型与停产老款也做。',
    homeTitle: '书衣｜电子阅读器保护壳 · 按单打印，冷门机型也有',
    homeDescription:
      '专做墨水屏阅读器保护壳，覆盖阅星瞳、Kindle、掌阅、文石等品牌，含停产老机型。按单 3D 打印，装机复核后 7 天内发出。没有你的型号？登记意向，够人要就开模。',
    productListTitle: '全部机型',
    productListDescription:
      '浏览书衣为 Kindle、文石、掌阅、阅星瞳等电子阅读器制作的 3D 打印保护壳，支持冷门及停产机型按需开模。',
  },
  naming: {
    compatibilityExample: '适用于 Kindle Paperwhite 5',
    adminHint:
      '第三方品牌与型号只用于说明兼容性。商品名称使用“适用于 品牌 型号”，不得使用第三方 Logo、官方包装视觉，或暗示官方出品、授权。',
  },
} as const;

export const orderStatusLabels: Record<string, string> = zhCN.orderStatus;
export const customerOrderStatusLabels: Record<string, string> =
  zhCN.customerOrderStatus;
export const printStatusLabels: Record<string, string> = zhCN.printStatus;
