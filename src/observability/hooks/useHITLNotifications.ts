import { useCallback, useState } from "react";
import type { HookEvent } from "@/observability/lib/types";

export function useHITLNotifications() {
  const [hasPermission, setHasPermission] = useState(
    () => "Notification" in window && Notification.permission === "granted"
  );

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setHasPermission(result === "granted");
  }, []);

  const notifyHITLRequest = useCallback(
    (event: HookEvent) => {
      if (!hasPermission || !("Notification" in window)) return;
      try {
        new Notification("🤚 Human-in-the-Loop Request", {
          body: event.humanInTheLoop?.question ?? "Action requires your approval",
          icon: "/favicon.ico",
          tag: `hitl-${event.session_id}`,
        });
      } catch {
        // permission may be revoked between check and call
      }
    },
    [hasPermission]
  );

  return { hasPermission, requestPermission, notifyHITLRequest };
}
