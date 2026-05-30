import { FinancialStatementsPaperTemplatePage } from "@rubydogjp/openkk-client/debug";

import { assertDebugRouteEnabled } from "../debug-route";

export default function Page() {
  assertDebugRouteEnabled();
  return <FinancialStatementsPaperTemplatePage />;
}
