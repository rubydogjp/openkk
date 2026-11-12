import { GeneralLedgerPaperTemplatePage } from "@rubydogjp/openkk-frontend-ui/debug";

import { assertDebugRouteEnabled } from "../debug-route";

export default function Page() {
  assertDebugRouteEnabled();
  return <GeneralLedgerPaperTemplatePage />;
}
