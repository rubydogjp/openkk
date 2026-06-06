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
  | "otherIncoming"
  | "otherSales"
  | "otherReceivableCollection";

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
    case "otherIncoming":
      return "その他の入金";
    case "otherSales":
      return "その他の売上";
    case "otherReceivableCollection":
      return "その他の回収";
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
    case "otherIncoming":
      return "売上以外の入金や、先に受け取ったお金を選びます。";
    case "otherSales":
      return "売掛金以外で売上を計上するケースを選びます。";
    case "otherReceivableCollection":
      return "売掛金以外の債権回収や現金回収を選びます。";
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
        { title: "その他の入金", nextPage: "otherIncoming" },
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
        { title: "その他の出金", close: true },
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
        { title: "その他の売上", nextPage: "otherSales" },
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
        { title: "その他の回収", nextPage: "otherReceivableCollection" },
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

    case "otherIncoming":
      return [
        {
          title: "雑収入が口座に入った",
          subtitle: "普通預金 | 雑収入",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "雑収入",
            description: "雑収入の入金",
          },
        },
        {
          title: "雑収入を現金で受け取った",
          subtitle: "現金 | 雑収入",
          template: {
            debitAccountName: "現金",
            creditAccountName: "雑収入",
            description: "雑収入の受取",
          },
        },
        {
          title: "前受金として受け取った",
          subtitle: "普通預金 | 前受金",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "前受金",
            description: "前受金の入金",
          },
        },
        { title: "科目を自分で選ぶ", close: true },
      ];

    case "otherSales":
      return [
        {
          title: "未収入金で売上を計上する",
          subtitle: "未収入金 | 売上",
          template: {
            debitAccountName: "未収入金",
            creditAccountName: "売上",
            description: "売上の発生",
          },
        },
        {
          title: "現金で売上を受け取った",
          subtitle: "現金 | 売上",
          template: {
            debitAccountName: "現金",
            creditAccountName: "売上",
            description: "売上の受取",
          },
        },
        { title: "科目を自分で選ぶ", close: true },
      ];

    case "otherReceivableCollection":
      return [
        {
          title: "売掛金を現金で回収した",
          subtitle: "現金 | 売掛金",
          template: {
            debitAccountName: "現金",
            creditAccountName: "売掛金",
            description: "売掛金の現金回収",
          },
        },
        {
          title: "未収入金を口座で回収した",
          subtitle: "普通預金 | 未収入金",
          template: {
            debitAccountName: "普通預金",
            creditAccountName: "未収入金",
            description: "未収入金の回収",
          },
        },
        {
          title: "未収入金を現金で回収した",
          subtitle: "現金 | 未収入金",
          template: {
            debitAccountName: "現金",
            creditAccountName: "未収入金",
            description: "未収入金の現金回収",
          },
        },
        { title: "科目を自分で選ぶ", close: true },
      ];
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
      subtitle: `消耗品費 | ${creditAccount}`,
      template: {
        debitAccountName: "消耗品費",
        creditAccountName: creditAccount,
        description: `${prefix}: 文房具・事務用品・消耗品`,
      },
    },
    {
      title: "広告・宣伝",
      subtitle: `広告宣伝費 | ${creditAccount}`,
      template: {
        debitAccountName: "広告宣伝費",
        creditAccountName: creditAccount,
        description: `${prefix}: 広告・宣伝`,
      },
    },
    {
      title: "配送・送料",
      subtitle: `荷造運賃 | ${creditAccount}`,
      template: {
        debitAccountName: "荷造運賃",
        creditAccountName: creditAccount,
        description: `${prefix}: 配送・送料`,
      },
    },
    {
      title: "手数料",
      subtitle: `支払手数料 | ${creditAccount}`,
      template: {
        debitAccountName: "支払手数料",
        creditAccountName: creditAccount,
        description: `${prefix}: 手数料`,
      },
    },
    {
      title: "税金・証明書",
      subtitle: `租税公課 | ${creditAccount}`,
      template: {
        debitAccountName: "租税公課",
        creditAccountName: creditAccount,
        description: `${prefix}: 税金・証明書`,
      },
    },
    {
      title: "本・資料",
      subtitle: `新聞図書費 | ${creditAccount}`,
      template: {
        debitAccountName: "新聞図書費",
        creditAccountName: creditAccount,
        description: `${prefix}: 本・資料`,
      },
    },
    {
      title: "修理・保守",
      subtitle: `修繕費 | ${creditAccount}`,
      template: {
        debitAccountName: "修繕費",
        creditAccountName: creditAccount,
        description: `${prefix}: 修理・保守`,
      },
    },
    {
      title: "福利厚生",
      subtitle: `福利厚生費 | ${creditAccount}`,
      template: {
        debitAccountName: "福利厚生費",
        creditAccountName: creditAccount,
        description: `${prefix}: 福利厚生`,
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
    { title: "科目を自分で選ぶ", close: true },
  ];
}

export const ACCOUNT_ALIASES: Record<string, string[]> = {
  売上: ["売上", "売上高"],
  売掛金: ["売掛金"],
  未収入金: ["未収入金"],
  普通預金: ["普通預金"],
  現金: ["現金"],
  未払金: ["未払金"],
  前受金: ["前受金"],
  事業主借: ["事業主借"],
  事業主貸: ["事業主貸"],
  地代家賃: ["地代家賃"],
  水道光熱費: ["水道光熱費"],
  通信費: ["通信費"],
  旅費交通費: ["旅費交通費"],
  接待交際費: ["接待交際費"],
  会議費: ["会議費"],
  消耗品費: ["消耗品費", "消耗品"],
  広告宣伝費: ["広告宣伝費"],
  荷造運賃: ["荷造運賃"],
  支払手数料: ["支払手数料"],
  租税公課: ["租税公課"],
  新聞図書費: ["新聞図書費"],
  修繕費: ["修繕費"],
  福利厚生費: ["福利厚生費"],
  雑費: ["雑費"],
  雑収入: ["雑収入"],
};

export function normalizeAccountName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

/**
 * 簡単入力ガイドのテンプレート科目名を、マスター科目に解決する。
 *
 * 同名科目が複数ある場合（例: 「消耗品費」「通信費」「水道光熱費」等は
 * 製造原価(cost_of_sales)版と販管費(expense)版が併存する）、ガイドは
 * 個人事業主の販管費／収益向けのため cost_of_sales 版を避けて解決する。
 * 完全一致を優先し、無ければ部分一致でフォールバックする。
 */
export function resolveBookAccountByName<
  T extends { name: string; accountType?: string | null },
>(name: string, accounts: readonly T[]): T | null {
  const aliases = ACCOUNT_ALIASES[name] ?? [name];
  const prefer = (matches: T[]): T | undefined =>
    matches.find((account) => account.accountType !== "cost_of_sales") ??
    matches[0];

  for (const alias of aliases) {
    const norm = normalizeAccountName(alias);
    const chosen = prefer(
      accounts.filter((account) => normalizeAccountName(account.name) === norm),
    );
    if (chosen != null) return chosen;
  }
  for (const alias of aliases) {
    const norm = normalizeAccountName(alias);
    const chosen = prefer(
      accounts.filter((account) =>
        normalizeAccountName(account.name).includes(norm),
      ),
    );
    if (chosen != null) return chosen;
  }
  return null;
}
