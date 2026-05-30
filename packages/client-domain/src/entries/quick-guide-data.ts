export type QuickGuidePage =
  | "top"
  | "incoming"
  | "outgoing"
  | "transfer"
  | "salesAccrual"
  | "receivableCollection"
  | "ownerDeposit"
  | "expensePayable"
  | "expenseImmediateCash"
  | "expenseOwnerBorrow"
  | "liabilityRepayment"
  | "ownerWithdrawal"
  | "cashToBank"
  | "bankToCash"
  | "unsupported";

export type QuickGuideTemplate = {
  debitAccountName: string;
  creditAccountName: string;
  description?: string;
  businessRatePercent?: number;
};

export type QuickGuideOption = {
  title: string;
  subtitle?: string;
  nextPage?: QuickGuidePage;
  template?: QuickGuideTemplate;

  close?: boolean;
};

export function guideTitle(page: QuickGuidePage): string {
  switch (page) {
    case "top":
      return "簡単入力ガイド";
    case "incoming":
      return "簡単入力ガイド - 入金";
    case "outgoing":
      return "簡単入力ガイド - 出金";
    case "transfer":
      return "簡単入力ガイド - 資金移動";
    case "salesAccrual":
      return "ユースケース - 売上の発生";
    case "receivableCollection":
      return "ユースケース - 債権の回収";
    case "ownerDeposit":
      return "ユースケース - 自己資金の入金";
    case "expensePayable":
      return "ユースケース - あと払い費用の発生";
    case "expenseImmediateCash":
      return "ユースケース - 即払い費用の発生";
    case "expenseOwnerBorrow":
      return "ユースケース - 事業主借り費用の発生";
    case "liabilityRepayment":
      return "ユースケース - 負債の返済";
    case "ownerWithdrawal":
      return "ユースケース - 自己資金の出金";
    case "cashToBank":
      return "ユースケース - 現金を預金へ交換";
    case "bankToCash":
      return "ユースケース - 預金を現金へ交換";
    case "unsupported":
      return "簡単入力ガイド - 未対応";
  }
}

export function guideDescription(page: QuickGuidePage): string | null {
  switch (page) {
    case "top":
      return "入金 / 出金 / 資金移動 から近いケースを選んでください。";
    case "incoming":
      return "事業口座へ資金が入ってくるときの取引。";
    case "outgoing":
      return "事業口座から資金が出ていくときの取引。";
    case "transfer":
      return "事業資金・プライベート資金の移動に関する取引。";
    case "unsupported":
      return "申し訳ございません. 簡単入力ガイドに対応していない取引は、手動で入力してください.\n仕訳の作成には外部のAIチャットサービスが役に立つ可能性があります";
    default:
      return null;
  }
}

export function guideOptions(page: QuickGuidePage): QuickGuideOption[] {
  switch (page) {
    case "top":
      return [
        {
          title: "入金",
          subtitle: "売上、プライベート口座からの入金など",
          nextPage: "incoming",
        },
        {
          title: "出金",
          subtitle: "経費、プライベート口座への出金など",
          nextPage: "outgoing",
        },
        {
          title: "資金移動",
          subtitle: "現金と預金の交換、自己資金の出し入れ",
          nextPage: "transfer",
        },
      ];

    case "incoming":
      return [
        { title: "報酬が確定した・請求書を送った", nextPage: "salesAccrual" },
        {
          title: "入金待ちだった報酬が口座に振り込まれた",
          nextPage: "receivableCollection",
        },
        { title: "この中にない", nextPage: "unsupported" },
      ];

    case "outgoing":
      return [
        {
          title: "請求書を受け取った・カードで費用を支払った",
          nextPage: "expensePayable",
        },
        {
          title: "費用をその場で事業サイフから現金払いした",
          nextPage: "expenseImmediateCash",
        },
        {
          title: "費用をその場でプライベートサイフから支払った",
          nextPage: "expenseOwnerBorrow",
        },
        {
          title: "カード利用分が口座から引き落とされた",
          nextPage: "liabilityRepayment",
        },
        { title: "この中にない", nextPage: "unsupported" },
      ];

    case "transfer":
      return [
        {
          title: "事業口座から事業財布へ現金を引き出した",
          nextPage: "bankToCash",
        },
        {
          title: "事業財布から事業口座へ現金を預け入れた",
          nextPage: "cashToBank",
        },
        {
          title: "事業口座からプライベート資金を引き出した",
          nextPage: "ownerWithdrawal",
        },
        {
          title: "プライベート資金から事業用口座に入金した",
          nextPage: "ownerDeposit",
        },
      ];

    case "salesAccrual":
      return [
        {
          title: "後日入金",
          subtitle: "売掛金 | 売上",
          template: {
            debitAccountName: "売掛金",
            creditAccountName: "売上",
            description: "売上の発生",
          },
        },
        {
          title: "即日入金",
          subtitle: "普通預金 | 売上",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "売上",
            description: "売上の入金",
          },
        },
        { title: "この中にない", nextPage: "unsupported" },
      ];

    case "receivableCollection":
      return [
        {
          title: "口座振り込み",
          subtitle: "普通預金 | 売掛金",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "売掛金",
            description: "売掛金の回収",
          },
        },
        { title: "この中にない", nextPage: "unsupported" },
      ];

    case "ownerDeposit":
      return [
        {
          title: "後日入金",
          subtitle: "普通預金 | 事業主借",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "事業主借",
            description: "自己資金の入金",
          },
        },
      ];

    case "expensePayable":
      return expenseOptions("未払金", "あと払い費用");
    case "expenseImmediateCash":
      return expenseOptions("現金", "即払い費用");
    case "expenseOwnerBorrow":
      return expenseOptions("事業主借", "事業主借り費用");

    case "liabilityRepayment":
      return [
        {
          title: "カード利用分の引き落とし",
          subtitle: "普通預金 | 未払金",
          template: {
            debitAccountName: "未払金",
            creditAccountName: "普通預金",
            description: "カード利用分の引き落とし",
          },
        },
      ];

    case "ownerWithdrawal":
      return [
        {
          title: "プライベート資金を引き出した",
          subtitle: "事業主貸 | 普通預金",
          template: {
            debitAccountName: "事業主貸",
            creditAccountName: "普通預金",
            description: "自己資金の出金",
          },
        },
      ];

    case "cashToBank":
      return [
        {
          title: "事業サイフから事業口座へ現金を預け入れた",
          subtitle: "普通預金 | 現金",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "現金",
            description: "現金を預金へ交換",
          },
        },
      ];

    case "bankToCash":
      return [
        {
          title: "事業口座から事業サイフへ現金を引き出した",
          subtitle: "現金 | 普通預金",
          template: {
            debitAccountName: "現金",
            creditAccountName: "普通預金",
            description: "預金を現金へ交換",
          },
        },
      ];

    case "unsupported":
      return [{ title: "簡単入力ガイドを終了", close: true }];
  }
}

function expenseOptions(
  creditAccount: string,
  prefix: string,
): QuickGuideOption[] {
  return [
    {
      title: "家賃・月額コワーキング",
      subtitle: `地代家賃 | ${creditAccount}`,
      template: {
        debitAccountName: "地代家賃",
        creditAccountName: creditAccount,
        description: `${prefix}: 家賃・月額コワーキング`,
        businessRatePercent: 100,
      },
    },
    {
      title: "電気・ガス・水道料金",
      subtitle: `水道光熱費 | ${creditAccount}`,
      template: {
        debitAccountName: "水道光熱費",
        creditAccountName: creditAccount,
        description: `${prefix}: 電気・ガス・水道料金`,
        businessRatePercent: 100,
      },
    },
    {
      title: "インターネット料金",
      subtitle: `通信費 | ${creditAccount}`,
      template: {
        debitAccountName: "通信費",
        creditAccountName: creditAccount,
        description: `${prefix}: インターネット料金`,
        businessRatePercent: 100,
      },
    },
    {
      title: "移動・宿泊",
      subtitle: `旅費交通費 | ${creditAccount}`,
      template: {
        debitAccountName: "旅費交通費",
        creditAccountName: creditAccount,
        description: `${prefix}: 移動・宿泊`,
      },
    },
    {
      title: "会食・お土産",
      subtitle: `接待交際費 | ${creditAccount}`,
      template: {
        debitAccountName: "接待交際費",
        creditAccountName: creditAccount,
        description: `${prefix}: 会食・お土産`,
      },
    },
    {
      title: "面談・会議室代",
      subtitle: `会議費 | ${creditAccount}`,
      template: {
        debitAccountName: "会議費",
        creditAccountName: creditAccount,
        description: `${prefix}: 面談・会議室代`,
      },
    },
    {
      title: "文房具・事務用品・消耗品",
      subtitle: `消耗品 | ${creditAccount}`,
      template: {
        debitAccountName: "消耗品",
        creditAccountName: creditAccount,
        description: `${prefix}: 文房具・事務用品・消耗品`,
      },
    },
    {
      title: "その他・雑費",
      subtitle: `雑費 | ${creditAccount}`,
      template: {
        debitAccountName: "雑費",
        creditAccountName: creditAccount,
        description: `${prefix}: その他・雑費`,
      },
    },
    { title: "この中にない", nextPage: "unsupported" },
  ];
}

export const ACCOUNT_ALIASES: Record<string, string[]> = {
  売上: ["売上", "売上高"],
  売掛金: ["売掛金"],
  普通預金: ["普通預金"],
  現金: ["現金"],
  未払金: ["未払金"],
  事業主借: ["事業主借"],
  事業主貸: ["事業主貸"],
  地代家賃: ["地代家賃"],
  水道光熱費: ["水道光熱費"],
  通信費: ["通信費"],
  旅費交通費: ["旅費交通費"],
  接待交際費: ["接待交際費"],
  会議費: ["会議費"],
  消耗品: ["消耗品", "消耗品費"],
  雑費: ["雑費"],
};

export function normalizeAccountName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}
