import { useState, useEffect } from "react";

/**
 * Hook to find and track the replay iframe inside an rrweb-player container.
 *
 * rrweb-player renders its replay inside an iframe. This hook observes the
 * player container for the iframe and returns a reference to it when found.
 */
export function useIframeFromPlayer(
  playerRef: React.RefObject<HTMLElement>,
): HTMLIFrameElement | null {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const container = playerRef.current;
    if (!container) return;

    // Try to find iframe immediately
    function findIframe() {
      const found = container!.querySelector("iframe");
      if (found && found !== iframe) {
        setIframe(found);
      }
      return found;
    }

    if (findIframe()) return;

    // If not found immediately, observe for it being added
    const observer = new MutationObserver(() => {
      findIframe();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [playerRef, iframe]);

  return iframe;
}
