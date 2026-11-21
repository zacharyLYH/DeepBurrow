import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

// Tailwind's md breakpoint, the one the sidebar layout switches on.
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
