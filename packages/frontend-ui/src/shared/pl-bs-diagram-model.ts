export type DiagramResultBlock = {
  side: "left" | "right";
  label: string;
  amount: number;
  tone: "positive" | "negative";
};

export function resolveProfitBlock(profit: number): DiagramResultBlock {
  if (profit < 0) {
    return { side: "right", label: "損失", amount: profit, tone: "negative" };
  }
  return {
    side: "left",
    label: profit === 0 ? "損益" : "利益",
    amount: profit,
    tone: "positive",
  };
}

export function resolveEquityBlock(equity: number): DiagramResultBlock {
  if (equity < 0) {
    return {
      side: "left",
      label: "債務超過",
      amount: equity,
      tone: "negative",
    };
  }
  return {
    side: "right",
    label: "純資産",
    amount: equity,
    tone: "positive",
  };
}
